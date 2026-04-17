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

async function fetchSSFulfillments(orderNumber) {
  const apiKey    = process.env.SHIPSTATION_API_KEY;
  const apiSecret = process.env.SHIPSTATION_API_SECRET;
  const authHeader = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;

  // SS API: GET /fulfillments?orderNumber=xxx — Mark as Shipped 的数据在这里
  const url = `https://ssapi.shipstation.com/fulfillments?orderNumber=${encodeURIComponent(orderNumber)}`;
  const res = await fetch(url, {
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SS HTTP ${res.status}: ${text.slice(0, 200)}`);
  const data = JSON.parse(text);
  return data.fulfillments || [];
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
      // 只拉没有 tracking number 的 manual orders（有 tracking 的跳过）
      const { data: orders } = await supabase
        .from('orders')
        .select('order_number')
        .ilike('order_number', 'MAN-%')
        .or('tracking_number.is.null,tracking_number.eq.');
      orderNumbers = (orders || []).map(o => o.order_number);
    } else if (orderNumber) {
      orderNumbers = [orderNumber];
    } else {
      return res.status(400).json({ error: 'Provide orderNumber or syncAll: true' });
    }

    for (const num of orderNumbers) {
      try {
        const fulfillments = await fetchSSFulfillments(num);
        if (!fulfillments.length) {
          results.push({ orderNumber: num, status: 'no_fulfillment' });
          continue;
        }

        // 找最新的未 void 的 fulfillment
        const active = fulfillments
          .filter(f => !f.voided)
          .sort((a, b) => new Date(b.createDate) - new Date(a.createDate));

        if (!active.length) {
          results.push({ orderNumber: num, status: 'all_voided' });
          continue;
        }

        const latest = active[0];
        const trackingNumber = latest.trackingNumber || '';
        const carrierCode    = latest.carrierCode    || '';

        const { error } = await supabase
          .from('orders')
          .update({
            tracking_number: trackingNumber,
            carrier:         carrierCode,
            status:          'shipped',
            shipped_at:      latest.shipDate || new Date().toISOString(),
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
