/**
 * /api/orders/jdl
 * JDL iFOP 出库订单查询
 * GET ?q=ORDER123       按客户订单号/JD单号搜索
 * GET ?page=1           分页
 * GET ?all=1            拉全量（循环分页）
 */

import crypto from 'crypto';

const BASE_URL        = process.env.JDL_BASE_URL        || 'https://intl-api.jdl.com';
const APP_KEY         = process.env.JDL_APP_KEY;
const APP_SECRET      = process.env.JDL_APP_SECRET;
const ACCESS_TOKEN    = process.env.JDL_ACCESS_TOKEN;
const CUSTOMER_CODE   = process.env.JDL_CUSTOMER_CODE   || 'KH20000015945';
const OPERATOR_ACCT   = process.env.JDL_OPERATOR_ACCT || '';
const SYSTEM_CODE     = process.env.JDL_SYSTEM_CODE || '2satest';
const OUTSTOCK_PATH   = '/fop/open/outstockprovider/queryoutstocklist';
const PAGE_SIZE       = 50;

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
    method:       OUTSTOCK_PATH,
    param_json:   JSON.stringify(body),
    timestamp,
    v:            '2.0',
  };
  const signContent = APP_SECRET
    + Object.keys(signMap).sort().map(k => k + signMap[k]).join('')
    + APP_SECRET;
  const sign = crypto.createHash('md5').update(signContent, 'utf8').digest('hex').toUpperCase();

  const url = new URL(OUTSTOCK_PATH, BASE_URL);
  url.searchParams.set('app_key',      APP_KEY);
  url.searchParams.set('access_token', ACCESS_TOKEN);
  url.searchParams.set('timestamp',    timestamp);
  url.searchParams.set('v',            '2.0');
  url.searchParams.set('sign',         sign);
  url.searchParams.set('method',       OUTSTOCK_PATH);
  url.searchParams.set('LOP-DN',       'JD_FOP_FULFILLMENT_CENTE');

  const res  = await fetch(url.toString(), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`JDL HTTP ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

function normalise(order) {
  const goods = order.goodsDtoList || [];
  return {
    id:              order.serviceBillCode || order.customerOrderNo,
    order_number:    order.serviceBillCode,
    reference_no:    order.customerOrderNo,
    jd_order_no:     order.jdOrderNo,
    warehouse:       order.warehouseCode,
    status:          order.statusDesc  || String(order.status || ''),
    status_code:     order.status,
    carrier:         order.actualCarrierName || '',
    tracking_number: order.preShipWayBill   || '',
    created_at:      order.createTime       || '',
    outbound_at:     order.outboundTime     || '',
    signed_at:       order.signingTime      || '',
    ship_to_name:    order.consigneeInformation?.consigneeName || '',
    ship_to_country: order.consigneeInformation?.country       || '',
    order_items: goods.map(g => ({
      sku:          g.customerGoodsId || g.jdGoodsId,
      quantity:     g.quantity        || 0,
      qty_actual:   g.realOutstockQuantity || 0,
    })),
    source:          'JDL',
  };
}

function parseMaybeJson(value) {
  if (!value || typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function pickPageObj(raw) {
  const lvl1 = parseMaybeJson(raw?.data);
  const lvl2 = parseMaybeJson(lvl1?.data || lvl1?.result || lvl1?.pageResult || lvl1);
  return parseMaybeJson(lvl2) || {};
}

function pickRecords(pageObj) {
  const direct = pageObj?.records
    || pageObj?.list
    || pageObj?.rows
    || pageObj?.items
    || pageObj?.resultList
    || pageObj?.dataList
    || [];
  return Array.isArray(direct) ? direct : [];
}

function isJdlSuccess(payload) {
  const code = String(payload?.code ?? '');
  return payload?.success === true || payload?.failed === false || payload?.errorCode === 0 || code === '200' || code === '1000';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (req.query.frontend === '1' && String(process.env.SHOW_JDL_ON_FRONTEND || 'true').toLowerCase() === 'false') {
    return res.status(200).json({ success: true, source: 'JDL', hidden: true, count: 0, data: [] });
  }
  if (!ACCESS_TOKEN || !APP_KEY || !APP_SECRET) {
    return res.status(500).json({ error: 'JDL credentials not configured' });
  }

  try {
    const { q, page = '1', all } = req.query;

    const baseBody = {
      pageNo:          1,
      pageNum:         1,
      page:            1,
      pageSize:        PAGE_SIZE,
      customerCode:    CUSTOMER_CODE,
    };
    if (OPERATOR_ACCT) baseBody.operatorAccount = OPERATOR_ACCT;
    baseBody.systemCode = SYSTEM_CODE;

    // 按订单号搜索
    if (q?.trim()) {
      baseBody.customerOrderNo = q.trim(); // 客户订单号（参考号）
    }

    // 拉全量：循环分页
    if (all === '1' && !q?.trim()) {
      const allOrders = [];
      let p = 1;
      let hasMore = true;
      while (hasMore && p <= 20) {
        const data = await callJdl({ ...baseBody, page: p, pageNo: p, pageNum: p });
        if (!isJdlSuccess(data)) {
          if (allOrders.length > 0) break;
          return res.status(400).json({ error: data.message || `JDL code ${data.code}`, raw: data });
        }
        const page_obj = pickPageObj(data);
        const records  = pickRecords(page_obj);
        allOrders.push(...records.map(normalise));
        const total     = parseInt(page_obj.total || page_obj.totalCount || records.length || 0, 10) || 0;
        const totalPage = parseInt(page_obj.totalPage || page_obj.pages || Math.ceil(total / PAGE_SIZE) || 1, 10) || 1;
        hasMore = p < totalPage;
        p++;
      }
      return res.status(200).json({
        success: true, source: 'JDL',
        count: allOrders.length, pages_fetched: p - 1,
        data: allOrders,
      });
    }

    // 单页或搜索
    const curPage = parseInt(page);
    const data = await callJdl({ ...baseBody, page: curPage, pageNo: curPage, pageNum: curPage });
    console.log('[JDL orders] response:', JSON.stringify(data).slice(0, 400));

    if (!isJdlSuccess(data)) {
      return res.status(400).json({ error: data.message || `JDL code ${data.code}`, raw: data });
    }

    const page_obj = pickPageObj(data);
    const records  = pickRecords(page_obj);
    return res.status(200).json({
      success:  true, source: 'JDL',
      count:    parseInt(page_obj.total || page_obj.totalCount || records.length || 0, 10) || records.length,
      page:     parseInt(page),
      totalPage: parseInt(page_obj.totalPage || page_obj.pages || 1, 10) || 1,
      data:     records.map(normalise),
    });

  } catch (err) {
    console.error('[JDL orders]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
