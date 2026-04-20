/**
 * /api/products/import-from-eccang
 * 从 ECCANG 拉 getProductList，批量导入到 products 表
 * POST { dryRun: true }  → 预览，不写入
 * POST { dryRun: false } → 实际导入
 */

import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '../auth/login';
import xml2js from 'xml2js';

const ECCANG_BASE_URL = process.env.ECCANG_BASE_URL;
const APP_TOKEN       = process.env.ECCANG_APP_TOKEN;
const APP_KEY         = process.env.ECCANG_APP_KEY;
const WAREHOUSE_CODE  = process.env.ECCANG_WAREHOUSE_CODE || 'AUSYD';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function buildSoap(service, paramsJson) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="http://www.example.org/Ec/">
  <SOAP-ENV:Body>
    <ns1:callService>
      <paramsJson>${JSON.stringify(paramsJson)}</paramsJson>
      <appToken>${APP_TOKEN}</appToken>
      <appKey>${APP_KEY}</appKey>
      <service>${service}</service>
    </ns1:callService>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;
}

async function parseSoap(xmlText) {
  const parser   = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
  const result   = await parser.parseStringPromise(xmlText);
  const envelope = result['SOAP-ENV:Envelope'] || result['soapenv:Envelope'];
  const body     = envelope['SOAP-ENV:Body']   || envelope['soapenv:Body'];
  const response = body['ns1:callServiceResponse']?.response
                || body['callServiceResponse']?.response;
  return JSON.parse(response);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!verifyToken(token)) return res.status(401).json({ error: 'Unauthorized' });

  const { dryRun = true } = req.body || {};

  if (!ECCANG_BASE_URL || !APP_TOKEN || !APP_KEY) {
    return res.status(500).json({ error: 'ECCANG credentials not configured' });
  }

  try {
    // 拉全量产品列表
    const allProducts = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 50) {
      const res2 = await fetch(ECCANG_BASE_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'text/xml; charset=UTF-8', 'SOAPAction': '' },
        body:    buildSoap('getProductList', {
          page,
          pageSize: '200',
          warehouse_code: WAREHOUSE_CODE,
        }),
      });

      if (!res2.ok) break;
      const data = await parseSoap(await res2.text());
      if (data.ask !== 'Success') {
        if (page === 1) return res.status(400).json({ error: data.message || 'ECCANG error', raw: data });
        break;
      }

      const items = Array.isArray(data.data) ? data.data
                  : data.data ? [data.data] : [];

      items.forEach(item => {
        const sku  = item.product_sku || item.sku || '';
        // 尝试所有可能的名称字段
        const name = item.product_name || item.goods_name || item.name
                   || item.product_title || item.title || '';
        if (sku) allProducts.push({ sku, product_name: name, source: 'ECCANG' });
      });

      hasMore = data.nextPage === 'true' || data.nextPage === true;
      page++;
    }

    if (allProducts.length === 0) {
      return res.status(200).json({
        success: true, dryRun,
        message: 'No products found from ECCANG',
        count: 0, products: [],
      });
    }

    if (dryRun) {
      return res.status(200).json({
        success: true, dryRun: true,
        count: allProducts.length,
        sample: allProducts.slice(0, 20),
        message: `Found ${allProducts.length} products. Set dryRun: false to import.`,
      });
    }

    // 실제 upsert
    const supabase = getSupabase();
    const BATCH = 100;
    let inserted = 0, updated = 0, errors = 0;

    for (let i = 0; i < allProducts.length; i += BATCH) {
      const batch = allProducts.slice(i, i + BATCH);
      const { data: upserted, error } = await supabase
        .from('products')
        .upsert(batch, { onConflict: 'sku', ignoreDuplicates: false })
        .select('id');

      if (error) {
        errors += batch.length;
        console.error('Upsert error:', error.message);
      } else {
        inserted += upserted?.length || batch.length;
      }
    }

    return res.status(200).json({
      success: true, dryRun: false,
      total:    allProducts.length,
      inserted, errors,
      message: `Imported ${inserted} products from ECCANG`,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
