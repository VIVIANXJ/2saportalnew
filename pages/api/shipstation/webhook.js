/**
 * /api/shipstation/webhook
 *
 * 接收 ShipStation Webhook 通知，更新订单 tracking 信息到 Supabase
 *
 * ShipStation Webhook 事件类型：
 *   SHIP_NOTIFY   — 订单发货，包含 tracking number
 *   ORDER_NOTIFY  — 订单状态变化
 *
 * ShipStation Webhook 文档：
 *   https://www.shipstation.com/docs/api/webhooks/
 *
 * 配置方式：
 *   ShipStation → Settings → Integrations → Webhooks → Add Webhook
 *   URL: https://你的域名/api/shipstation/webhook
 *   事件选: Ship Notify
 *   Secret Key: 填入 SHIPSTATION_WEBHOOK_SECRET（可选但推荐）
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// 验证 SS Webhook 签名（可选，但推荐）
function verifySignature(body, signature, secret) {
  if (!secret || !signature) return true; // 没配 secret 就跳过验证
  const hmac = crypto.createHmac('sha256', secret).update(body).digest('base64');
  return hmac === signature;
}

// SS Webhook payload 里拿 resourceUrl，再调 SS API 拿完整订单详情
async function fetchSSOrder(resourceUrl) {
  const apiKey    = process.env.SHIPSTATION_API_KEY;
  const apiSecret = process.env.SHIPSTATION_API_SECRET;
  if (!apiKey || !apiSecret) return null;

  const authHeader = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;
  const res = await fetch(resourceUrl, {
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 验证签名
  const signature = req.headers['x-shipstation-hmac-sha256'];
  const secret    = process.env.SHIPSTATION_WEBHOOK_SECRET || '';
  const rawBody   = JSON.stringify(req.body);

  if (secret && !verifySignature(rawBody, signature, secret)) {
    console.error('[SS Webhook] Invalid signature');
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  const { resource_type, resource_url } = req.body || {};
  console.log('[SS Webhook] Received:', resource_type, resource_url);

  // 只处理 SHIP_NOTIFY 事件
  if (resource_type !== 'SHIP_NOTIFY') {
    return res.status(200).json({ success: true, message: `Ignored event: ${resource_type}` });
  }

  if (!resource_url) {
    return res.status(400).json({ error: 'Missing resource_url' });
  }

  try {
    // 从 SS 拉取发货详情
    const shipments = await fetchSSOrder(resource_url);
    if (!shipments?.shipments?.length) {
      return res.status(200).json({ success: true, message: 'No shipments found' });
    }

    const supabase = getSupabase();
    const results  = [];

    for (const shipment of shipments.shipments) {
      const {
        orderNumber,
        trackingNumber,
        carrierCode,
        shipDate,
        voided,
      } = shipment;

      if (voided) continue; // 跳过已取消的发货
      if (!orderNumber || !trackingNumber) continue;

      // 更新 Supabase 订单
      const { data, error } = await supabase
        .from('orders')
        .update({
          tracking_number: trackingNumber,
          carrier:         carrierCode || '',
          status:          'shipped',
          shipped_at:      shipDate || new Date().toISOString(),
        })
        .eq('order_number', orderNumber)
        .select('id, order_number')
        .single();

      if (error) {
        console.error(`[SS Webhook] Failed to update ${orderNumber}:`, error.message);
        results.push({ orderNumber, success: false, error: error.message });
      } else {
        console.log(`[SS Webhook] Updated ${orderNumber} → tracking: ${trackingNumber}`);
        results.push({ orderNumber, success: true, trackingNumber });
      }
    }

    return res.status(200).json({ success: true, processed: results.length, results });

  } catch (err) {
    console.error('[SS Webhook] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
