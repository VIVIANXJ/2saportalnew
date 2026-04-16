import crypto from 'crypto';

const BASE_URL        = process.env.JDL_BASE_URL        || 'https://intl-api.jdl.com';
const APP_KEY         = process.env.JDL_APP_KEY;
const APP_SECRET      = process.env.JDL_APP_SECRET;
const ACCESS_TOKEN    = process.env.JDL_ACCESS_TOKEN;
const CUSTOMER_CODE   = process.env.JDL_CUSTOMER_CODE   || 'KH20000015945';
const OPERATOR_ACCT   = process.env.JDL_OPERATOR_ACCT || '';
const SYSTEM_CODE     = process.env.JDL_SYSTEM_CODE || '';
const WAREHOUSES = (process.env.JDL_WAREHOUSES || 'C0000001174,C0000001901')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);
const STOCK_PATH       = '/fop/open/stockprovider/querystockwarehouselistbypage';
const BATCH_STOCK_PATH = '/fop/open/stockprovider/querystockbatchwarehouselistbypage';

function getTimestamp() {
  return new Date(Date.now() + 8 * 3600 * 1000)
    .toISOString().replace('T', ' ').slice(0, 19);
}

async function callApi(apiPath, bodyObj) {
  const timestamp = getTimestamp();
  const body = [bodyObj];
  const signMap = {
    access_token: ACCESS_TOKEN,
    app_key:      APP_KEY,
    method:       apiPath,
    param_json:   JSON.stringify(body),
    timestamp,
    v:            '2.0',
  };
  const signContent = APP_SECRET
    + Object.keys(signMap).sort().map(k => k + signMap[k]).join('')
    + APP_SECRET;
  const sign = crypto.createHash('md5').update(signContent, 'utf8').digest('hex').toUpperCase();

  const url = new URL(apiPath, BASE_URL);
  url.searchParams.set('app_key',      APP_KEY);
  url.searchParams.set('access_token', ACCESS_TOKEN);
  url.searchParams.set('timestamp',    timestamp);
  url.searchParams.set('v',            '2.0');
  url.searchParams.set('sign',         sign);
  url.searchParams.set('method',       apiPath);
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

async function queryWarehouse(warehouseCode, skuList) {
  const isJdlSuccess = (payload) => {
    const code = String(payload?.code ?? '');
    return payload?.success === true || payload?.failed === false || payload?.errorCode === 0 || code === '200' || code === '1000';
  };
  const baseBody = {
    page: 1,
    pageNo: 1,
    pageNum: 1,
    pageSize: 50,
    customerCode:    CUSTOMER_CODE,
    warehouseCode,
    systemType:      '10',
    cargoOwnerCode:  process.env.JDL_CARGO_OWNER_CODE || '',
  };
  if (OPERATOR_ACCT) baseBody.operatorAccount = OPERATOR_ACCT;
  if (SYSTEM_CODE) baseBody.systemCode = SYSTEM_CODE;
  if (skuList?.length) baseBody.customerGoodsIdList = skuList;

  // 同时调非批次 + 批次库存接口
  const [r1, r2] = await Promise.allSettled([
    callApi(STOCK_PATH,       { ...baseBody }),
    callApi(BATCH_STOCK_PATH, { ...baseBody }),
  ]);

  // 汇总结果
  const skuMap = {};
  const addItems = (records) => {
    (records || []).forEach(item => {
      const sku = item.sku || item.customerGoodsId || item.jdGoodsId;
      if (!sku) return;
      if (!skuMap[sku]) skuMap[sku] = { sku, sellable: 0, reserved: 0, onway: 0, total: 0 };
      skuMap[sku].sellable += Number(item.sellable ?? item.stockQuantity               ?? 0);
      skuMap[sku].reserved += Number(item.reserved ?? item.preoccupiedQuantity         ?? 0);
      skuMap[sku].onway    += Number(item.onway    ?? item.purchaseWaitinStockQuantity  ?? 0);
      skuMap[sku].total    += Number(item.total    ?? item.totalQuantity                ?? 0);
    });
  };

  const parseMaybeJson = (value) => {
    if (!value || typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  };
  const pickPageObj = (raw) => {
    const lvl1 = parseMaybeJson(raw?.data);
    const lvl2 = parseMaybeJson(lvl1?.data || lvl1?.result || lvl1?.pageResult || lvl1);
    return parseMaybeJson(lvl2) || {};
  };
  const pickRecords = (raw) => {
    const pageObj = pickPageObj(raw);
    const arr = pageObj?.records
      || pageObj?.list
      || pageObj?.rows
      || pageObj?.items
      || pageObj?.resultList
      || pageObj?.dataList
      || [];
    return Array.isArray(arr) ? arr : [];
  };

  console.log('[JDL] r1:', r1.status, r1.status==='fulfilled' ? JSON.stringify(r1.value).slice(0,200) : r1.reason?.message);
  console.log('[JDL] r2:', r2.status, r2.status==='fulfilled' ? JSON.stringify(r2.value).slice(0,200) : r2.reason?.message);

  let hasData = false;
  if (r1.status === 'fulfilled' && isJdlSuccess(r1.value)) {
    addItems(pickRecords(r1.value));
    hasData = true;
  }
  if (r2.status === 'fulfilled' && isJdlSuccess(r2.value)) {
    addItems(pickRecords(r2.value));
    hasData = true;
  }

  if (!hasData) {
    const msg = (r1.status === 'fulfilled' ? r1.value.message : r1.reason?.message)
             || (r2.status === 'fulfilled' ? r2.value.message : r2.reason?.message)
             || 'No data';
    throw new Error(msg);
  }

  return { code: 200, data: { records: Object.values(skuMap) } };
}


export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!ACCESS_TOKEN || !APP_KEY || !APP_SECRET) {
    return res.status(500).json({ error: 'JDL credentials not configured' });
  }

  const { sku } = req.query;
  const skuList = sku ? sku.split(',').map(s => s.trim()).filter(Boolean) : null;

  const results = await Promise.allSettled(
    WAREHOUSES.map(wh => queryWarehouse(wh, skuList))
  );

  const allItems = [];
  const warehouseStatus = {};

  results.forEach((result, i) => {
    const wh = WAREHOUSES[i];
    if (result.status === 'fulfilled') {
      const raw = result.value;
      if (raw.code === 200 || raw.code === '200') {
        (raw.data?.records || []).forEach(item => {
          allItems.push({
            sku:            item.sku || item.customerGoodsId || item.jdGoodsId,
            warehouse:      'JDL',
            warehouse_code: wh,
            sellable:       item.sellable  ?? item.stockQuantity               ?? 0,
            reserved:       item.reserved  ?? item.preoccupiedQuantity         ?? 0,
            onway:          item.onway     ?? item.purchaseWaitinStockQuantity  ?? 0,
            total:          item.total     ?? item.totalQuantity                ?? 0,
          });
        });
        warehouseStatus[wh] = 'ok';
      } else {
        warehouseStatus[wh] = raw.message || `code ${raw.code}`;
      }
    } else {
      warehouseStatus[wh] = result.reason?.message || 'error';
    }
  });

  return res.status(200).json({
    success: true, warehouse: 'JDL',
    warehouse_status: warehouseStatus,
    count: allItems.length, data: allItems,
  });
}
