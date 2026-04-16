/**
 * /api/shipstation/sync-tracking
 * 主动从 SS 拉取指定订单的 tracking 信息，更新到 Supabase
 *
 * POST { orderNumber: 'MAN-20250416-123456' }
 * 或
 * POST { syncAll: true }  — 同步所有 MAN- 开头且状态不是 shipped 的订单
 */
import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '../auth/login';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function fetchSSShipments(orderNumber) {
  const apiKey    = process.env.SHIPSTATION_API_KEY;
  const apiSecret = process.env.SHIPSTATION_API_SECRET;
  const authHeader = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;

  // SS API: GET /shipments?orderNumber=xxx
  const res = await fetch(
    `https://ssapi.shipstation.com/shipments?orderNumber=${encodeURIComponent(orderNumber)}`,
    { headers: { Authorization: authHeader, 'Content-Type': 'application/json' } }
  );
  if (!res.ok) throw new Error(`SS HTTP ${res.status}`);
  const data = await res.json();
  return data.shipments || [];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth  = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!verifyToken(token)) return res.status(401).json({ error: 'Unauthorized' });

  const apiKey    = process.env.SHIPSTATION_API_KEY;
  const apiSecret = process.env.SHIPSTATION_API_SECRET;
  if (!apiKey || !apiSecret) return res.status(500).json({ error: 'ShipStation credentials not configured' });

  const supabase = getSupabase();
  const { orderNumber, syncAll } = req.body || {};
  const results = [];

  try {
    let orderNumbers = [];

    if (syncAll) {
      // 拉所有未发货的 manual orders
      const { data: orders } = await supabase
        .from('orders')
        .select('order_number')
        .ilike('order_number', 'MAN-%')
        .not('status', 'eq', 'shipped');
      orderNumbers = (orders || []).map(o => o.order_number);
    } else if (orderNumber) {
      orderNumbers = [orderNumber];
    } else {
      return res.status(400).json({ error: 'Provide orderNumber or syncAll: true' });
    }

    for (const num of orderNumbers) {
      try {
        const shipments = await fetchSSShipments(num);
        // 找最新的未 void 的发货记录
        const active = shipments.filter(s => !s.voided);
        if (!active.length) {
          results.push({ orderNumber: num, status: 'no_shipment' });
          continue;
        }
        // 按 shipDate 排序取最新
        active.sort((a, b) => new Date(b.shipDate) - new Date(a.shipDate));
        const latest = active[0];

        const { error } = await supabase
          .from('orders')
          .update({
            tracking_number: latest.trackingNumber   || '',
            carrier:         latest.carrierCode      || '',
            status:          'shipped',
            shipped_at:      latest.shipDate         || new Date().toISOString(),
          })
          .eq('order_number', num);

        if (error) {
          results.push({ orderNumber: num, status: 'error', error: error.message });
        } else {
          results.push({ orderNumber: num, status: 'updated', trackingNumber: latest.trackingNumber, carrier: latest.carrierCode });
        }
      } catch (e) {
        results.push({ orderNumber: num, status: 'error', error: e.message });
      }
    }

    const updated = results.filter(r => r.status === 'updated').length;
    return res.status(200).json({ success: true, synced: orderNumbers.length, updated, results });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
