/**
 * /api/orders/sync-from-eccang
 * 
 * 按参考号匹配：把 ECCANG/JDL 订单的 tracking 同步到 Manual Orders
 * 
 * POST { dryRun: true }  — 预览会匹配到哪些，不实际更新
 * POST { dryRun: false } — 实际同步
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

async function fetchEccangOrderByRef(refCode) {
  const res = await fetch(ECCANG_BASE_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'text/xml; charset=UTF-8', 'SOAPAction': '' },
    body:    buildSoap('getOrderByRefCode', { ref_code: refCode, warehouse_code: WAREHOUSE_CODE }),
  });
  if (!res.ok) throw new Error(`ECCANG HTTP ${res.status}`);
  const data = await parseSoap(await res.text());
  if (data.ask !== 'Success' || !data.data) return null;
  const orders = Array.isArray(data.data) ? data.data : [data.data];
  // 找有 tracking 的那条
  const withTracking = orders.filter(o => o.logistics_code);
  if (!withTracking.length) return null;
  // 取最新
  const latest = withTracking.sort((a, b) => new Date(b.create_time||0) - new Date(a.create_time||0))[0];
  return {
    tracking_number: latest.logistics_code || '',
    carrier:         latest.logistics_name || '',
    status:          latest.order_status_name || latest.order_status || '',
    shipped_at:      latest.delivery_time || latest.create_time || null,
    source:          'ECCANG',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth  = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!verifyToken(token)) return res.status(401).json({ error: 'Unauthorized' });

  const { dryRun = true, orderIds } = req.body || {};
  const supabase = getSupabase();

  // 1. 拿所有没有 tracking 的 manual orders
  let query = supabase
    .from('orders')
    .select('id, order_number, reference_no, tracking_number, carrier')
    .ilike('order_number', 'MAN-%')
    .not('reference_no', 'is', null)
    .or('tracking_number.is.null,tracking_number.eq.');

  if (orderIds?.length) query = query.in('id', orderIds);

  const { data: manualOrders, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  if (!manualOrders?.length) return res.status(200).json({ success: true, message: 'No manual orders without tracking found', matches: [] });

  const results = [];

  for (const mo of manualOrders) {
    if (!mo.reference_no?.trim()) {
      results.push({ id: mo.id, order_number: mo.order_number, reference_no: mo.reference_no, status: 'no_ref' });
      continue;
    }

    try {
      // Try ECCANG
      const eccangData = await fetchEccangOrderByRef(mo.reference_no.trim());

      if (!eccangData?.tracking_number) {
        results.push({ id: mo.id, order_number: mo.order_number, reference_no: mo.reference_no, status: 'no_match' });
        continue;
      }

      if (!dryRun) {
        const { error: updateError } = await supabase
          .from('orders')
          .update({
            tracking_number: eccangData.tracking_number,
            carrier:         eccangData.carrier,
            status:          'shipped',
            shipped_at:      eccangData.shipped_at || new Date().toISOString(),
          })
          .eq('id', mo.id);

        if (updateError) {
          results.push({ id: mo.id, order_number: mo.order_number, reference_no: mo.reference_no, status: 'error', error: updateError.message });
          continue;
        }
      }

      results.push({
        id:             mo.id,
        order_number:   mo.order_number,
        reference_no:   mo.reference_no,
        status:         dryRun ? 'preview' : 'synced',
        tracking_number: eccangData.tracking_number,
        carrier:        eccangData.carrier,
        source:         eccangData.source,
      });

    } catch (e) {
      results.push({ id: mo.id, order_number: mo.order_number, reference_no: mo.reference_no, status: 'error', error: e.message });
    }
  }

  const synced  = results.filter(r => r.status === 'synced').length;
  const preview = results.filter(r => r.status === 'preview').length;
  const noMatch = results.filter(r => r.status === 'no_match').length;
  const errors  = results.filter(r => r.status === 'error').length;

  return res.status(200).json({
    success: true,
    dryRun,
    summary: { total: manualOrders.length, synced, preview, no_match: noMatch, errors },
    results,
  });
}
