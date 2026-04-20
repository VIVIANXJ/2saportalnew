/**
 * /api/cron/sync-inventory
 *
 * 由 Vercel Cron Job 每天凌晨 2:00 AEST 自动触发。
 * Admin 后台也可手动触发（带有效 JWT Authorization header）。
 *
 * 直接调用仓库 API（不走内部 HTTP fetch 自己调自己），
 * 把结果 upsert 到 Supabase inventory_cache 表。
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import xml2js from 'xml2js';

// ── Supabase ─────────────────────────────────────────────────
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// ── ECCANG ───────────────────────────────────────────────────
async function fetchEccang() {
  const BASE_URL       = process.env.ECCANG_BASE_URL;
  const APP_TOKEN      = process.env.ECCANG_APP_TOKEN;
  const APP_KEY        = process.env.ECCANG_APP_KEY;
  const WAREHOUSE_CODE = process.env.ECCANG_WAREHOUSE_CODE || 'AUSYD';
  const maxPages = parseInt(process.env.ECCANG_INV_MAX_PAGES || '200', 10) || 200;
  const pageSize = parseInt(process.env.ECCANG_INV_PAGE_SIZE || '100', 10) || 100;

  if (!BASE_URL || !APP_TOKEN || !APP_KEY) return { error: 'ECCANG credentials not configured' };

  const callPage = async (page) => {
    const paramsJson = { page, pageSize: String(pageSize), warehouse_code: WAREHOUSE_CODE };
    const soap = `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="http://www.example.org/Ec/">
  <SOAP-ENV:Body>
    <ns1:callService>
      <paramsJson>${JSON.stringify(paramsJson)}</paramsJson>
      <appToken>${APP_TOKEN}</appToken>
      <appKey>${APP_KEY}</appKey>
      <service>getProductInventory</service>
    </ns1:callService>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=UTF-8', SOAPAction: '' },
      body: soap,
    });
    const xml = await res.text();
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
    const result = await parser.parseStringPromise(xml);
    const envelope = result['SOAP-ENV:Envelope'] || result['soapenv:Envelope'];
    const body     = envelope['SOAP-ENV:Body']   || envelope['soapenv:Body'];
    const response = body['ns1:callServiceResponse']?.response || body['callServiceResponse']?.response;
    return JSON.parse(response);
  };

  try {
    let p = 1, hasMore = true;
    const all = [];
    while (hasMore && p <= maxPages) {
      const data = await callPage(p);
      if (data.ask !== 'Success') return { error: data.message || 'ECCANG error' };
      const items = Array.isArray(data.data) ? data.data : (data.data ? [data.data] : []);
      all.push(...items);
      hasMore = data.nextPage === true || data.nextPage === 'true';
      p++;
    }
    return {
      success: true,
      data: all.map(item => ({
        sku:            item.product_sku,
        warehouse:      'ECCANG',
        warehouse_code: 'ECCANG',
        sellable:       parseInt(item.sellable)   || 0,
        reserved:       parseInt(item.reserved)   || 0,
        onway:          parseInt(item.onway)       || 0,
        unsellable:     parseInt(item.unsellable)  || 0,
        hold_qty:       parseInt(item.hold)        || 0,
      })),
    };
  } catch (e) {
    return { error: e.message };
  }
}

// ── JDL ──────────────────────────────────────────────────────
const JDL_WAREHOUSES   = (process.env.JDL_WAREHOUSES || 'C0000001174,C0000001901').split(',').map(v => v.trim()).filter(Boolean);
const JDL_STOCK_PATH   = '/fop/open/stockprovider/querystockwarehouselistbypage';
const JDL_BATCH_PATH   = '/fop/open/stockprovider/querystockbatchwarehouselistbypage';

async function jdlCallApi(apiPath, bodyObj) {
  const BASE_URL     = process.env.JDL_BASE_URL || 'https://intl-api.jdl.com';
  const APP_KEY      = process.env.JDL_APP_KEY;
  const APP_SECRET   = process.env.JDL_APP_SECRET;
  const ACCESS_TOKEN = process.env.JDL_ACCESS_TOKEN;
  const timestamp    = new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const body = [bodyObj];
  const signMap = { access_token: ACCESS_TOKEN, app_key: APP_KEY, method: apiPath, param_json: JSON.stringify(body), timestamp, v: '2.0' };
  const signContent = APP_SECRET + Object.keys(signMap).sort().map(k => k + signMap[k]).join('') + APP_SECRET;
  const sign = crypto.createHash('md5').update(signContent, 'utf8').digest('hex').toUpperCase();
  const url = new URL(apiPath, BASE_URL);
  url.searchParams.set('app_key', APP_KEY);
  url.searchParams.set('access_token', ACCESS_TOKEN);
  url.searchParams.set('timestamp', timestamp);
  url.searchParams.set('v', '2.0');
  url.searchParams.set('sign', sign);
  url.searchParams.set('method', apiPath);
  url.searchParams.set('LOP-DN', 'JD_FOP_FULFILLMENT_CENTE');
  const res  = await fetch(url.toString(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`JDL HTTP ${res.status}`);
  return JSON.parse(text);
}

async function fetchJdlWarehouse(warehouseCode) {
  const CUSTOMER_CODE = process.env.JDL_CUSTOMER_CODE || 'KH20000015945';
  const OPERATOR_ACCT = process.env.JDL_OPERATOR_ACCT || '';
  const SYSTEM_CODE   = process.env.JDL_SYSTEM_CODE   || '2satest';
  const maxPages = parseInt(process.env.JDL_INV_MAX_PAGES || '200', 10) || 200;

  const parseMaybeJson = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return v; } };
  const pickPageObj = (raw) => parseMaybeJson(parseMaybeJson(raw?.data)?.data || parseMaybeJson(raw?.data)?.result || parseMaybeJson(raw?.data)?.pageResult || parseMaybeJson(raw?.data)) || {};
  const pickRecords = (raw) => { const p = pickPageObj(raw); return p?.records || p?.list || p?.rows || p?.items || p?.resultList || p?.dataList || []; };
  const isSuccess = (p) => { const c = String(p?.code ?? ''); return p?.success === true || p?.failed === false || c === '200' || c === '1000'; };

  const baseBody = {
    page: 1, pageNo: 1, pageNum: 1, pageSize: 50,
    customerCode: CUSTOMER_CODE,
    warehouseCode,
    systemType: '10',
    systemCode: SYSTEM_CODE,
    ...(OPERATOR_ACCT && { operatorAccount: OPERATOR_ACCT }),
    ...(process.env.JDL_CARGO_OWNER_CODE && { cargoOwnerCode: process.env.JDL_CARGO_OWNER_CODE }),
  };

  const collectRecords = async (apiPath) => {
    let page = 1, hasMore = true;
    const records = [];
    while (hasMore && page <= maxPages) {
      const payload = await jdlCallApi(apiPath, { ...baseBody, page, pageNo: page, pageNum: page });
      if (!isSuccess(payload)) throw new Error(payload?.message || `JDL error ${payload?.code}`);
      const pageObj = pickPageObj(payload);
      const rows = pickRecords(payload);
      records.push(...rows);
      const totalPages = parseInt(pageObj?.pages || pageObj?.totalPage || 1, 10) || 1;
      hasMore = page < totalPages && rows.length > 0;
      page++;
    }
    return records;
  };

  const [r1, r2] = await Promise.allSettled([collectRecords(JDL_STOCK_PATH), collectRecords(JDL_BATCH_PATH)]);
  const records1 = r1.status === 'fulfilled' ? (r1.value || []) : [];
  const records2 = r2.status === 'fulfilled' ? (r2.value || []) : [];
  const chosen   = records1.length > 0 ? records1 : records2;

  if (chosen.length === 0) {
    const msg = (r1.value?.message || r1.reason?.message || r2.value?.message || r2.reason?.message || 'No data');
    throw new Error(msg);
  }

  const skuMap = {};
  chosen.forEach(item => {
    const sku = item.sku || item.customerGoodsId || item.jdGoodsId;
    if (!sku) return;
    if (!skuMap[sku]) skuMap[sku] = { sku, warehouse: 'JDL', warehouse_code: warehouseCode, sellable: 0, reserved: 0, onway: 0, unsellable: 0, hold_qty: 0 };
    skuMap[sku].sellable += item.sellable ?? item.stockQuantity              ?? 0;
    skuMap[sku].reserved += item.reserved ?? item.preoccupiedQuantity        ?? 0;
    skuMap[sku].onway    += item.onway    ?? item.purchaseWaitinStockQuantity ?? 0;
  });
  return Object.values(skuMap);
}

async function fetchJdl() {
  const results = await Promise.allSettled(JDL_WAREHOUSES.map(wh => fetchJdlWarehouse(wh)));
  const all = [], errors = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') all.push(...r.value);
    else errors.push(`${JDL_WAREHOUSES[i]}: ${r.reason?.message}`);
  });
  if (all.length === 0 && errors.length > 0) return { error: errors.join(' | ') };
  return { success: true, data: all };
}

// ── Handler ───────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 鉴权：Vercel Cron secret 或任意有效 Bearer token（admin JWT）
  const authHeader = req.headers['authorization'] || '';
  const cronSecret = process.env.CRON_SECRET;
  const isCron  = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const hasToken = authHeader.startsWith('Bearer ') && authHeader.length > 20;
  if (cronSecret && !isCron && !hasToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const startedAt = new Date().toISOString();
  const supabase  = getSupabase();
  console.log(`[sync-inventory] Start ${startedAt}`);

  try {
    // 直接调仓库 API（不走 HTTP 自己调自己）
    const [eccangResult, jdlResult] = await Promise.allSettled([fetchEccang(), fetchJdl()]);

    const eccang = eccangResult.status === 'fulfilled' ? eccangResult.value : { error: eccangResult.reason?.message };
    const jdl    = jdlResult.status    === 'fulfilled' ? jdlResult.value    : { error: jdlResult.reason?.message };

    console.log(`[sync-inventory] ECCANG: ${eccang.data?.length ?? 'error: ' + eccang.error} items`);
    console.log(`[sync-inventory] JDL: ${jdl.data?.length ?? 'error: ' + jdl.error} items`);

    // 合并成 cache rows
    const now  = new Date().toISOString();
    const rows = [];

    (eccang.data || []).forEach(item => {
      if (!item.sku) return;
      rows.push({ sku: item.sku, warehouse: 'ECCANG', warehouse_code: 'ECCANG', sellable: item.sellable || 0, reserved: item.reserved || 0, onway: item.onway || 0, unsellable: item.unsellable || 0, hold_qty: item.hold_qty || 0, last_synced_at: now });
    });

    (jdl.data || []).forEach(item => {
      if (!item.sku) return;
      rows.push({ sku: item.sku, warehouse: 'JDL', warehouse_code: item.warehouse_code, sellable: item.sellable || 0, reserved: item.reserved || 0, onway: item.onway || 0, unsellable: 0, hold_qty: 0, last_synced_at: now });
    });

    console.log(`[sync-inventory] Upserting ${rows.length} rows`);

    // 分批 upsert
    const BATCH = 200;
    const upsertErrors = [];
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await supabase.from('inventory_cache').upsert(rows.slice(i, i + BATCH), { onConflict: 'sku,warehouse_code' });
      if (error) { console.error('Upsert error:', error.message); upsertErrors.push(error.message); }
    }

    // 写日志
    const skuCount = new Set(rows.map(r => r.sku)).size;
    await supabase.from('inventory_sync_log').insert({
      synced_at: now,
      sku_count: skuCount,
      row_count: rows.length,
      status:    upsertErrors.length === 0 ? 'success' : 'partial',
      error_msg: upsertErrors.length > 0 ? upsertErrors.join('; ') : null,
    });

    return res.status(200).json({
      success:   true,
      synced_at: now,
      sku_count: skuCount,
      row_count: rows.length,
      eccang:    eccang.error ? { error: eccang.error } : { count: eccang.data?.length },
      jdl:       jdl.error   ? { error: jdl.error }   : { count: jdl.data?.length },
      upsert_errors: upsertErrors,
    });

  } catch (err) {
    console.error('[sync-inventory] Fatal:', err.message);
    await supabase.from('inventory_sync_log').insert({ synced_at: startedAt, sku_count: 0, row_count: 0, status: 'failed', error_msg: err.message }).catch(() => {});
    return res.status(500).json({ error: err.message });
  }
}
