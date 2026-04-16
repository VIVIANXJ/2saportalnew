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

async function fetchSSOrder(orderNumber) {
  const apiKey    = process.env.SHIPSTATION_API_KEY;
  const apiSecret = process.env.SHIPSTATION_API_SECRET;
  const authHeader = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;

  // SS API: GET /orders?orderNumber=xxx — 从订单直接拿 tracking 信息
  const url = `https://ssapi.shipstation.com/orders?orderNumber=${encodeURIComponent(orderNumber)}`;
  console.log('[SS sync] fetching order:', url);
  const res = await fetch(url, {
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' }
  });
  const text = await res.text();
  console.log('[SS sync] order response:', text.slice(0, 600));
  if (!res.ok) throw new Error(`SS HTTP ${res.status}: ${text.slice(0, 200)}`);
  const data = JSON.parse(text);
  const orders = data.orders || [];
  console.log('[SS sync] orders found:', orders.length);
  if (orders.length > 0) {
    // 打印完整订单数据，找 tracking 字段位置
    const o = orders[0];
    console.log('[SS sync] full order keys:', Object.keys(o).join(', '));
    console.log('[SS sync] tracking fields:', JSON.stringify({
      trackingNumber: o.trackingNumber,
      carrierCode: o.carrierCode,
      serviceCode: o.serviceCode,
      shipDate: o.shipDate,
      holdUntilDate: o.holdUntilDate,
      labelMessages: o.labelMessages,
      shipments: o.shipments,
      fulfillments: o.fulfillments,
      // advancedOptions tracking fields
      externallyFulfilled: o.advancedOptions?.externallyFulfilled,
      externallyFulfilledBy: o.advancedOptions?.externallyFulfilledBy,
    }));
  }
  return orders;
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
        const ssOrders = await fetchSSOrder(num);
        if (!ssOrders.length) {
          results.push({ orderNumber: num, status: 'not_found_in_ss' });
          continue;
        }
        const ssOrder = ssOrders[0];
        console.log('[SS sync] order status:', ssOrder.orderStatus, 'tracking:', ssOrder.trackingNumber, 'carrier:', ssOrder.carrierCode);

        // 只有已发货或包含 tracking 时才更新
        const trackingNumber = ssOrder.trackingNumber || '';
        const carrierCode    = ssOrder.carrierCode    || '';
        const isShipped      = ssOrder.orderStatus === 'shipped' || trackingNumber;

        if (!isShipped) {
          results.push({ orderNumber: num, status: 'not_shipped_yet', ssStatus: ssOrder.orderStatus });
          continue;
        }

        const { error } = await supabase
          .from('orders')
          .update({
            tracking_number: trackingNumber,
            carrier:         carrierCode,
            status:          'shipped',
            shipped_at:      ssOrder.shipDate || new Date().toISOString(),
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
