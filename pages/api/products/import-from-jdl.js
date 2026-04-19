/**
 * /api/products/import-from-jdl
 * 从 JDL /fop/open/querygoodsprovider/querypage 拉产品，导入 products 表
 * POST { dryRun: true }  → 预览
 * POST { dryRun: false } → 实际导入
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '../auth/login';

const BASE_URL       = process.env.JDL_BASE_URL     || 'https://intl-api.jdl.com';
const APP_KEY        = process.env.JDL_APP_KEY;
const APP_SECRET     = process.env.JDL_APP_SECRET;
const ACCESS_TOKEN   = process.env.JDL_ACCESS_TOKEN;
const CUSTOMER_CODE  = process.env.JDL_CUSTOMER_CODE || 'KH20000015945';
const OPERATOR_ACCT  = process.env.JDL_OPERATOR_ACCT || 'g70capital';
const SYSTEM_CODE    = process.env.JDL_SYSTEM_CODE   || '2satest';
const CARGO_OWNER    = process.env.JDL_CARGO_OWNER_CODE || '';
const GOODS_PATH     = '/fop/open/querygoodsprovider/querypage';
const PAGE_SIZE      = 100;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function getTimestamp() {
  return new Date(Date.now() + 8 * 3600 * 1000)
    .toISOString().replace('T', ' ').slice(0, 19);
}

async function callJdl(bodyObj) {
  const timestamp = getTimestamp();
  const body = [bodyObj];

  const signMap = {
    access_token: ACCESS_TOKEN,
    app_key:      APP_KEY,
    method:       GOODS_PATH,
    param_json:   JSON.stringify(body),
    timestamp,
    v:            '2.0',
  };
  const signContent = APP_SECRET
    + Object.keys(signMap).sort().map(k => k + signMap[k]).join('')
    + APP_SECRET;
  const sign = crypto.createHash('md5').update(signContent, 'utf8').digest('hex').toUpperCase();

  const url = new URL(GOODS_PATH, BASE_URL);
  url.searchParams.set('app_key',      APP_KEY);
  url.searchParams.set('access_token', ACCESS_TOKEN);
  url.searchParams.set('timestamp',    timestamp);
  url.searchParams.set('v',            '2.0');
  url.searchParams.set('sign',         sign);
  url.searchParams.set('method',       GOODS_PATH);
  url.searchParams.set('LOP-DN',       'JD_FOP_FULFILLMENT_CENTE');

  const res = await fetch(url.toString(), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`JDL HTTP ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!verifyToken(token)) return res.status(401).json({ error: 'Unauthorized' });

  const { dryRun = true } = req.body || {};

  if (!APP_KEY || !APP_SECRET || !ACCESS_TOKEN) {
    return res.status(500).json({ error: 'JDL credentials not configured' });
  }

  try {
    const allProducts = [];
    let pageNo = 1;
    let hasMore = true;

    while (hasMore && pageNo <= 50) {
      const data = await callJdl({
        customerCode:    CUSTOMER_CODE,
        operatorAccount: OPERATOR_ACCT,
        systemCode:      SYSTEM_CODE,
        ...(CARGO_OWNER && { cargoOwnerCode: CARGO_OWNER }),
        pageNo,
        pageSize: PAGE_SIZE,
      });

      console.log(`[JDL products] page ${pageNo} response:`, JSON.stringify(data).slice(0, 500));

      // JDL returns code 200 or 1000 for success
      const isSuccess = data.code === 200 || data.code === '200' || data.code === 1000 || data.code === '1000';
      if (!isSuccess) {
        if (pageNo === 1) {
          return res.status(400).json({
            error: data.message || `JDL code ${data.code}`,
            raw: data,
          });
        }
        break;
      }

      const page = data.data || {};
      const rows = page.rows || [];
      console.log(`[JDL products] page ${pageNo}: ${rows.length} rows, totalPages: ${page.pages}`);

      rows.forEach(item => {
        const sku  = item.customerGoodsId || item.jdGoodsId || '';
        const name = item.goodsName || '';
        if (sku) allProducts.push({ sku, product_name: name });
      });

      const totalPages = page.pages || 1;
      hasMore = pageNo < totalPages;
      pageNo++;
    }

    if (allProducts.length === 0) {
      return res.status(200).json({
        success: true, dryRun,
        message: 'No products found from JDL',
        count: 0,
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

    // Upsert to products table
    const supabase = getSupabase();
    const BATCH = 100;
    let inserted = 0, errors = 0;

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
      total: allProducts.length,
      inserted, errors,
      message: `Imported ${inserted} products from JDL`,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
