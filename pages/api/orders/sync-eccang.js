import { createClient } from '@supabase/supabase-js';
import xml2js from 'xml2js';
import { verifyToken } from '../auth/login';

const ECCANG_BASE_URL = process.env.ECCANG_BASE_URL;
const APP_TOKEN = process.env.ECCANG_APP_TOKEN;
const APP_KEY = process.env.ECCANG_APP_KEY;
const WAREHOUSE_CODE = process.env.ECCANG_WAREHOUSE_CODE || 'AUSYD';
const DEFAULT_SYNC_CLIENT = (process.env.DEFAULT_SYNC_CLIENT || 'ASL').toUpperCase() === 'CCEP' ? 'CCEP' : 'ASL';

function normaliseStatus(rawStatus) {
  const s = String(rawStatus || '').toLowerCase();
  if (s.includes('cancel')) return 'cancelled';
  if (s.includes('deliver') || s.includes('sign') || s.includes('完成')) return 'delivered';
  if (s.includes('ship') || s.includes('out') || s.includes('出库') || s.includes('dispatch')) return 'shipped';
  if (s.includes('pack')) return 'packed';
  if (s.includes('process') || s.includes('pick') || s.includes('分拣')) return 'processing';
  return 'pending';
}

function resolveClient(referenceNo) {
  const ref = String(referenceNo || '').toUpperCase();
  if (ref.startsWith('ASL')) return 'ASL';
  if (ref.startsWith('CCEP')) return 'CCEP';
  return DEFAULT_SYNC_CLIENT;
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
  const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
  const result = await parser.parseStringPromise(xmlText);
  const envelope = result['SOAP-ENV:Envelope'] || result['soapenv:Envelope'];
  const body = envelope['SOAP-ENV:Body'] || envelope['soapenv:Body'];
  const response = body['ns1:callServiceResponse']?.response || body['callServiceResponse']?.response;
  return JSON.parse(response);
}

async function callEccang(params) {
  const res = await fetch(ECCANG_BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=UTF-8', SOAPAction: '' },
    body: buildSoap('getOrderList', params),
  });
  if (!res.ok) throw new Error(`ECCANG HTTP ${res.status}`);
  return parseSoap(await res.text());
}

function norm(order) {
  const referenceNo = order.ref_code || order.ref_no || order.reference_no || order.reference || '';
  const statusValue = order.order_status_name || order.order_status || order.status_name || order.status || '';
  const shipToAddressObj = {
    country: order.country || null,
    province: order.province || order.state || null,
    city: order.city || order.town || null,
    address: order.address || order.address1 || order.street || null,
  };
  return {
    order_number: order.order_code,
    reference_no: referenceNo || null,
    warehouse: 'ECCANG',
    status: normaliseStatus(statusValue),
    carrier: order.logistics_name || order.logistics_channel_name || null,
    tracking_number: order.logistics_code || order.tracking_number || order.tracking_no || null,
    created_at: order.create_time || null,
    shipped_at: order.delivery_time || null,
    ship_to_name: order.consignee_name || order.receiver_name || null,
    ship_to_address: shipToAddressObj,
    order_type: 'standard',
    client: resolveClient(referenceNo),
  };
}

export default async function handler(req, res) {
  if (!['POST', 'GET'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!verifyToken(token)) return res.status(401).json({ error: 'Unauthorized' });
  if (!ECCANG_BASE_URL || !APP_TOKEN || !APP_KEY) {
    return res.status(500).json({ error: 'ECCANG credentials not configured' });
  }

  const source = req.method === 'GET' ? req.query : (req.body || {});
  const pageSize = Math.max(20, Math.min(200, parseInt(source.pageSize || '100', 10) || 100));
  const maxPages = Math.max(1, Math.min(1000, parseInt(source.maxPages || '100', 10) || 100));
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const allRows = [];
    let p = 1;
    let hasMore = true;
    while (hasMore && p <= maxPages) {
      const data = await callEccang({
        page: p,
        pageSize: String(pageSize),
        warehouse_code: WAREHOUSE_CODE,
      });
      if (data.ask !== 'Success') break;
      const orders = Array.isArray(data.data) ? data.data : (data.data ? [data.data] : []);
      allRows.push(...orders.map(norm).filter(o => o.order_number));
      hasMore = data.nextPage === true || data.nextPage === 'true';
      p++;
    }

    const batchSize = 500;
    let upserted = 0;
    for (let i = 0; i < allRows.length; i += batchSize) {
      const chunk = allRows.slice(i, i + batchSize);
      const { error } = await supabase
        .from('orders')
        .upsert(chunk, { onConflict: 'order_number' });
      if (error) throw new Error(error.message);
      upserted += chunk.length;
    }

    return res.status(200).json({
      success: true,
      fetched: allRows.length,
      upserted,
      pages_fetched: p - 1,
      page_size: pageSize,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
