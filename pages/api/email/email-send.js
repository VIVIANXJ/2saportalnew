/**
 * /api/email/send
 *
 * POST { type, order, recipients }
 *   type:       'order_confirmation' | 'shipping_notification'
 *   order:      full order object (with order_items)
 *   recipients: string[] — email addresses to send to
 *
 * Uses Resend API. Set RESEND_API_KEY in Vercel environment variables.
 * FROM address: set RESEND_FROM in env, or defaults to onboarding@resend.dev (test only)
 */

import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '../auth/login';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_ADDRESS   = process.env.RESEND_FROM || 'CCEP 3PL Portal <onboarding@resend.dev>';
const PORTAL_URL     = process.env.NEXT_PUBLIC_SITE_URL || 'https://2saportalnew.vercel.app';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// ── HTML Email Templates ─────────────────────────────────────

function baseTemplate(content) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; background: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wrapper { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #F4010A; padding: 20px 32px; }
    .header-title { color: #fff; font-size: 17px; font-weight: 600; letter-spacing: 0.02em; }
    .body { padding: 28px 32px; }
    .label { font-size: 12px; color: #999; margin-bottom: 4px; }
    .value { font-size: 14px; color: #111; font-weight: 600; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; background: #f8f8f8; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .section-title { font-size: 13px; font-weight: 700; color: #111; margin: 20px 0 10px; }
    table.items { width: 100%; border-collapse: collapse; font-size: 13px; }
    table.items th { padding: 8px 10px; text-align: left; color: #999; font-weight: 600; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #eee; }
    table.items td { padding: 9px 10px; border-bottom: 1px solid #f0f0f0; color: #333; }
    table.items td.sku { font-family: monospace; color: #1a6cf6; font-size: 12px; }
    .address-block { border-left: 3px solid #eee; padding: 6px 0 6px 14px; line-height: 1.8; font-size: 13px; color: #555; margin: 8px 0 20px; }
    .tracking-box { background: #f0f7ff; border: 1px solid #c8e0ff; border-radius: 8px; padding: 14px 16px; margin: 16px 0; }
    .tracking-link { color: #1a6cf6; font-weight: 600; font-size: 13px; text-decoration: none; }
    .cta { display: inline-block; background: #F4010A; color: #fff; text-decoration: none; padding: 11px 24px; border-radius: 8px; font-weight: 700; font-size: 14px; margin: 4px 0 24px; }
    .footer { border-top: 1px solid #eee; padding: 18px 32px; font-size: 11px; color: #aaa; line-height: 1.7; }
    .badge { display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 10px; border-radius: 20px; }
    .badge-pending  { background: #FEF3C7; color: #92400E; }
    .badge-shipped  { background: #D1FAE5; color: #065F46; }
    .badge-backorder { background: #FEF3C7; color: #92400E; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="header-title">CCEP 3PL Portal</div>
    </div>
    <div class="body">${content}</div>
    <div class="footer">
      This email was sent by CCEP 3PL Portal. If you have questions about your order, please contact your account manager.<br>
      © ${new Date().getFullYear()} Coca-Cola Europacific Partners
    </div>
  </div>
</body>
</html>`;
}

function getTrackingUrl(carrier, tracking) {
  if (!carrier || !tracking) return null;
  const c = carrier.toLowerCase();
  if (c.includes('auspost') || c.includes('australia post')) return `https://auspost.com.au/mypost/track/#/details/${tracking}`;
  if (c.includes('fedex'))  return `https://www.fedex.com/fedextrack/?tracknumbers=${tracking}`;
  if (c.includes('dhl'))    return `https://www.dhl.com/en/express/tracking.html?AWB=${tracking}`;
  if (c.includes('tnt'))    return `https://www.tnt.com/express/en_au/site/tracking.html?searchType=CON&cons=${tracking}`;
  return null;
}

function orderConfirmationHtml(order) {
  const addr = order.ship_to_address || {};
  const items = order.order_items || [];
  const orderUrl = `${PORTAL_URL}/admin#order-${order.order_number}`;

  const itemRows = items.map(it => `
    <tr>
      <td>${it.product_name || it.sku}</td>
      <td class="sku">${it.sku}</td>
      <td style="text-align:right; font-weight:600;">${it.quantity}</td>
    </tr>
  `).join('');

  return baseTemplate(`
    <p style="font-size:12px;color:#999;margin:0 0 4px;">Order confirmation</p>
    <p style="font-size:20px;font-weight:700;color:#111;margin:0 0 16px;">Your order has been placed</p>
    <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 20px;">
      Hi ${order.ship_to_name || 'there'}, your order has been received and is now being processed.
      You'll receive another email once it ships.
    </p>

    <div class="meta-grid">
      <div><div class="label">Order number</div><div class="value" style="font-family:monospace;font-size:13px;">${order.order_number}</div></div>
      <div><div class="label">Reference</div><div class="value">${order.reference_no || '—'}</div></div>
      <div><div class="label">Date placed</div><div class="value">${new Date(order.created_at || Date.now()).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}</div></div>
      <div><div class="label">Status</div><div class="value"><span class="badge badge-${order.status || 'pending'}">${order.status || 'Pending'}</span></div></div>
    </div>

    <div class="section-title">Items ordered</div>
    <table class="items">
      <thead><tr><th>Product</th><th>SKU</th><th style="text-align:right;">Qty</th></tr></thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div class="section-title">Delivery address</div>
    <div class="address-block">
      ${order.ship_to_name}<br>
      ${order.customer_company ? order.customer_company + '<br>' : ''}
      ${addr.address1 || ''}${addr.address2 ? ', ' + addr.address2 : ''}<br>
      ${addr.suburb || ''} ${addr.state || ''} ${addr.postcode || ''}<br>
      ${addr.country || 'Australia'}
    </div>

    <a href="${orderUrl}" class="cta">View order details</a>
  `);
}

function shippingNotificationHtml(order) {
  const addr = order.ship_to_address || {};
  const items = order.order_items || [];
  const trackUrl = getTrackingUrl(order.carrier, order.tracking_number);
  const orderUrl = `${PORTAL_URL}/admin#order-${order.order_number}`;

  const itemRows = items.map(it => `
    <tr>
      <td>${it.product_name || it.sku}</td>
      <td class="sku">${it.sku}</td>
      <td style="text-align:right; font-weight:600;">${it.quantity}</td>
    </tr>
  `).join('');

  return baseTemplate(`
    <p style="font-size:12px;color:#999;margin:0 0 4px;">Shipping notification</p>
    <p style="font-size:20px;font-weight:700;color:#111;margin:0 0 16px;">Your order is on its way</p>
    <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 20px;">
      Hi ${order.ship_to_name || 'there'}, your order has been dispatched and is now on its way to you.
      Use the tracking details below to follow your delivery.
    </p>

    <div class="meta-grid">
      <div><div class="label">Order number</div><div class="value" style="font-family:monospace;font-size:13px;">${order.order_number}</div></div>
      <div><div class="label">Reference</div><div class="value">${order.reference_no || '—'}</div></div>
      <div><div class="label">Shipped date</div><div class="value">${new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}</div></div>
      <div><div class="label">Status</div><div class="value"><span class="badge badge-shipped">Shipped</span></div></div>
    </div>

    ${order.tracking_number ? `
    <div class="tracking-box">
      <div style="font-size:13px;font-weight:700;margin-bottom:10px;">Tracking details</div>
      <div style="display:flex;gap:32px;flex-wrap:wrap;">
        <div><div class="label">Carrier</div><div class="value">${order.carrier || '—'}</div></div>
        <div><div class="label">Tracking number</div><div class="value" style="font-family:monospace;">${order.tracking_number}</div></div>
      </div>
      ${trackUrl ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #c8e0ff;"><a href="${trackUrl}" class="tracking-link">Track my parcel →</a></div>` : ''}
    </div>
    ` : ''}

    <div class="section-title">Items shipped</div>
    <table class="items">
      <thead><tr><th>Product</th><th>SKU</th><th style="text-align:right;">Qty</th></tr></thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div class="section-title">Delivery address</div>
    <div class="address-block">
      ${order.ship_to_name}<br>
      ${order.customer_company ? order.customer_company + '<br>' : ''}
      ${addr.address1 || ''}${addr.address2 ? ', ' + addr.address2 : ''}<br>
      ${addr.suburb || ''} ${addr.state || ''} ${addr.postcode || ''}<br>
      ${addr.country || 'Australia'}
    </div>

    <a href="${orderUrl}" class="cta">View order details</a>
  `);
}

// ── Send via Resend ──────────────────────────────────────────

async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    FROM_ADDRESS,
      to:      Array.isArray(to) ? to : [to],
      subject,
      html,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.name || 'Resend error');
  return data;
}

// ── Handler ──────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!verifyToken(token)) return res.status(401).json({ error: 'Unauthorized' });

  const { type, order, recipients } = req.body || {};

  if (!type || !order || !recipients?.length) {
    return res.status(400).json({ error: 'type, order, and recipients required' });
  }

  const supabase = getSupabase();

  try {
    let subject, html;

    if (type === 'order_confirmation') {
      subject = `Order Confirmation — ${order.order_number}`;
      html    = orderConfirmationHtml(order);
    } else if (type === 'shipping_notification') {
      subject = `Your order is on its way — ${order.order_number}`;
      html    = shippingNotificationHtml(order);
    } else {
      return res.status(400).json({ error: `Unknown email type: ${type}` });
    }

    const result = await sendEmail({ to: recipients, subject, html });

    // Log email sent to orders table
    await supabase
      .from('orders')
      .update({
        email_sent_at:    new Date().toISOString(),
        email_recipients: recipients.join(', '),
        email_type:       type,
      })
      .eq('id', order.id);

    return res.status(200).json({ success: true, id: result.id });

  } catch (e) {
    console.error('[email/send]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
