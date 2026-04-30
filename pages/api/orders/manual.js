import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '../auth/login';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// 下单成功后从 inventory_cache 扣减 sellable 数量
async function deductStock(supabase, items) {
  if (!items || items.length === 0) return;
  for (const item of items) {
    if (!item.sku || !item.quantity) continue;
    const qty = Number(item.quantity);
    if (qty <= 0) continue;
    // 按比例从各仓库扣减（优先从有库存的仓库扣）
    const { data: rows } = await supabase
      .from('inventory_cache')
      .select('id, sku, warehouse_code, sellable')
      .eq('sku', item.sku)
      .gt('sellable', 0)
      .order('sellable', { ascending: false });

    let remaining = qty;
    for (const row of (rows || [])) {
      if (remaining <= 0) break;
      const deduct = Math.min(remaining, row.sellable);
      await supabase
        .from('inventory_cache')
        .update({ sellable: row.sellable - deduct })
        .eq('id', row.id);
      remaining -= deduct;
    }
  }
}

// Send email notification via Resend directly (fire-and-forget)
async function sendOrderEmail(type, order, recipients) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const validRecipients = (recipients || []).filter(r => r && typeof r === 'string' && r.includes('@'));
  if (!apiKey || !validRecipients.length) return;
  recipients = validRecipients;
  try {
    // Dynamically build subject and html based on type
    const portalUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://2saportalnew.vercel.app';
    const addr = order.ship_to_address || {};
    const items = order.order_items || [];
    const itemRows = items.map(it => `<tr><td>${it.product_name || it.sku}</td><td style="font-family:monospace;color:#1a6cf6">${it.sku}</td><td style="text-align:right;font-weight:600">${it.quantity}</td></tr>`).join('');

    let subject, html;
    if (type === 'order_confirmation') {
      subject = `Order Confirmation — ${order.order_number}`;
      html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.w{max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}.h{background:#F4010A;padding:20px 32px;color:#fff;font-size:17px;font-weight:600}.b{padding:28px 32px}.g{display:grid;grid-template-columns:1fr 1fr;gap:14px;background:#f8f8f8;border-radius:8px;padding:16px;margin:20px 0}.l{font-size:12px;color:#999;margin-bottom:4px}.v{font-size:14px;color:#111;font-weight:600}table{width:100%;border-collapse:collapse;font-size:13px}th{padding:8px 10px;text-align:left;color:#999;font-weight:600;font-size:11px;text-transform:uppercase;border-bottom:1px solid #eee}td{padding:9px 10px;border-bottom:1px solid #f0f0f0;color:#333}.a{border-left:3px solid #eee;padding:6px 0 6px 14px;line-height:1.8;font-size:13px;color:#555;margin:8px 0 20px}.cta{display:inline-block;background:#F4010A;color:#fff;text-decoration:none;padding:11px 24px;border-radius:8px;font-weight:700;font-size:14px;margin:4px 0 24px}.f{border-top:1px solid #eee;padding:18px 32px;font-size:11px;color:#aaa;line-height:1.7}</style></head><body><div class="w"><div class="h">CCEP 3PL Portal</div><div class="b"><p style="font-size:12px;color:#999;margin:0 0 4px">Order confirmation</p><p style="font-size:20px;font-weight:700;color:#111;margin:0 0 16px">Your order has been placed</p><p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 20px">Hi ${order.ship_to_name || 'there'}, your order has been received and is now being processed. You'll receive another email once it ships.</p><div class="g"><div><div class="l">Order number</div><div class="v" style="font-family:monospace;font-size:13px">${order.order_number}</div></div><div><div class="l">Reference</div><div class="v">${order.reference_no || '—'}</div></div><div><div class="l">Date placed</div><div class="v">${new Date().toLocaleDateString('en-AU', {day:'2-digit',month:'short',year:'numeric'})}</div></div><div><div class="l">Status</div><div class="v">${order.status || 'Pending'}</div></div></div><p style="font-size:13px;font-weight:700;margin:20px 0 10px">Items ordered</p><table><thead><tr><th>Product</th><th>SKU</th><th style="text-align:right">Qty</th></tr></thead><tbody>${itemRows}</tbody></table><p style="font-size:13px;font-weight:700;margin:20px 0 8px">Delivery address</p><div class="a">${order.ship_to_name}<br>${order.customer_company ? order.customer_company + '<br>' : ''}${addr.address1 || ''}${addr.address2 ? ', ' + addr.address2 : ''}<br>${addr.suburb || ''} ${addr.state || ''} ${addr.postcode || ''}<br>${addr.country || 'Australia'}</div><a href="${portalUrl}/admin" class="cta">View order details</a></div><div class="f">This email was sent by CCEP 3PL Portal. © ${new Date().getFullYear()} Coca-Cola Europacific Partners</div></div></body></html>`;
    } else if (type === 'shipping_notification') {
      subject = `Your order is on its way — ${order.order_number}`;
      html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.w{max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}.h{background:#F4010A;padding:20px 32px;color:#fff;font-size:17px;font-weight:600}.b{padding:28px 32px}.g{display:grid;grid-template-columns:1fr 1fr;gap:14px;background:#f8f8f8;border-radius:8px;padding:16px;margin:20px 0}.l{font-size:12px;color:#999;margin-bottom:4px}.v{font-size:14px;color:#111;font-weight:600}table{width:100%;border-collapse:collapse;font-size:13px}th{padding:8px 10px;text-align:left;color:#999;font-weight:600;font-size:11px;text-transform:uppercase;border-bottom:1px solid #eee}td{padding:9px 10px;border-bottom:1px solid #f0f0f0;color:#333}.a{border-left:3px solid #eee;padding:6px 0 6px 14px;line-height:1.8;font-size:13px;color:#555;margin:8px 0 20px}.tb{background:#f0f7ff;border:1px solid #c8e0ff;border-radius:8px;padding:14px 16px;margin:16px 0}.cta{display:inline-block;background:#F4010A;color:#fff;text-decoration:none;padding:11px 24px;border-radius:8px;font-weight:700;font-size:14px;margin:4px 0 24px}.f{border-top:1px solid #eee;padding:18px 32px;font-size:11px;color:#aaa;line-height:1.7}</style></head><body><div class="w"><div class="h">CCEP 3PL Portal</div><div class="b"><p style="font-size:12px;color:#999;margin:0 0 4px">Shipping notification</p><p style="font-size:20px;font-weight:700;color:#111;margin:0 0 16px">Your order is on its way</p><p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 20px">Hi ${order.ship_to_name || 'there'}, your order has been dispatched and is now on its way to you.</p><div class="g"><div><div class="l">Order number</div><div class="v" style="font-family:monospace;font-size:13px">${order.order_number}</div></div><div><div class="l">Reference</div><div class="v">${order.reference_no || '—'}</div></div><div><div class="l">Shipped date</div><div class="v">${new Date().toLocaleDateString('en-AU', {day:'2-digit',month:'short',year:'numeric'})}</div></div><div><div class="l">Status</div><div class="v">Shipped</div></div></div>${order.tracking_number ? `<div class="tb"><p style="font-size:13px;font-weight:700;margin:0 0 12px">Tracking details</p><table style="width:100%;border-collapse:collapse"><tr><td style="padding:6px 0;width:140px;font-size:11px;color:#999;font-weight:600;text-transform:uppercase">Carrier</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#111">${order.carrier || '—'}</td></tr><tr><td style="padding:6px 0;font-size:11px;color:#999;font-weight:600;text-transform:uppercase">Tracking Number</td><td style="padding:6px 0;font-family:monospace;font-size:14px;font-weight:600;color:#111">${order.tracking_number}</td></tr>${order.tracking_link ? `<tr><td style="padding:6px 0;font-size:11px;color:#999;font-weight:600;text-transform:uppercase">Track Link</td><td style="padding:6px 0"><a href="${order.tracking_link}" style="color:#1a6cf6;font-weight:600;font-size:13px">Track my parcel →</a></td></tr>` : ''}${order.project_tracking_note ? `<tr><td style="padding:6px 0;font-size:11px;color:#999;font-weight:600;text-transform:uppercase;vertical-align:top">Project Note</td><td style="padding:6px 0;font-size:13px;color:#333;line-height:1.6">${order.project_tracking_note}</td></tr>` : ''}</table></div>` : ''}<p style="font-size:13px;font-weight:700;margin:20px 0 10px">Items shipped</p><table><thead><tr><th>Product</th><th>SKU</th><th style="text-align:right">Qty</th></tr></thead><tbody>${itemRows}</tbody></table><p style="font-size:13px;font-weight:700;margin:20px 0 8px">Delivery address</p><div class="a">${order.ship_to_name}<br>${order.customer_company ? order.customer_company + '<br>' : ''}${addr.address1 || ''}${addr.address2 ? ', ' + addr.address2 : ''}<br>${addr.suburb || ''} ${addr.state || ''} ${addr.postcode || ''}<br>${addr.country || 'Australia'}</div><a href="${portalUrl}/admin" class="cta">View order details</a></div><div class="f">This email was sent by CCEP 3PL Portal. © ${new Date().getFullYear()} Coca-Cola Europacific Partners</div></div></body></html>`;
    } else if (type === 'order_notification') {
      // Internal notification to operations team
      const placedBy = order.created_by_username || 'Unknown';
      subject = `New Order — ${order.order_number} (placed by ${placedBy})`;
      html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.w{max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}.h{background:#F4010A;padding:20px 32px;color:#fff;font-size:17px;font-weight:600}.b{padding:28px 32px}.g{display:grid;grid-template-columns:1fr 1fr;gap:14px;background:#f8f8f8;border-radius:8px;padding:16px;margin:20px 0}.l{font-size:12px;color:#999;margin-bottom:4px}.v{font-size:14px;color:#111;font-weight:600}table{width:100%;border-collapse:collapse;font-size:13px}th{padding:8px 10px;text-align:left;color:#999;font-weight:600;font-size:11px;text-transform:uppercase;border-bottom:1px solid #eee}td{padding:9px 10px;border-bottom:1px solid #f0f0f0;color:#333}.a{border-left:3px solid #eee;padding:6px 0 6px 14px;line-height:1.8;font-size:13px;color:#555;margin:8px 0 16px}.f{border-top:1px solid #eee;padding:18px 32px;font-size:11px;color:#aaa;line-height:1.7}</style></head><body><div class="w"><div class="h">CCEP 3PL Portal — New Order Alert</div><div class="b"><p style="font-size:14px;color:#555;margin:0 0 20px">A new order has been placed on the portal.</p><div class="g"><div><div class="l">Order number</div><div class="v" style="font-family:monospace;font-size:13px">${order.order_number}</div></div><div><div class="l">Placed by</div><div class="v">${placedBy}</div></div><div><div class="l">Reference</div><div class="v">${order.reference_no || '—'}</div></div><div><div class="l">Recipient</div><div class="v">${order.ship_to_name || '—'}</div></div></div><p style="font-size:13px;font-weight:700;margin:20px 0 10px">Items</p><table><thead><tr><th>Product</th><th>SKU</th><th style="text-align:right">Qty</th></tr></thead><tbody>${items.map(it => `<tr><td>${it.product_name||it.sku}</td><td style="font-family:monospace;color:#1a6cf6">${it.sku}</td><td style="text-align:right;font-weight:600">${it.quantity}</td></tr>`).join('')}</tbody></table><p style="font-size:13px;font-weight:700;margin:20px 0 8px">Delivery address</p><div class="a">${order.ship_to_name}<br>${order.customer_company?order.customer_company+'<br>':''}${addr.address1||''}${addr.address2?', '+addr.address2:''}<br>${addr.suburb||''} ${addr.state||''} ${addr.postcode||''}<br>${addr.country||'Australia'}</div></div><div class="f">CCEP 3PL Portal © ${new Date().getFullYear()} Coca-Cola Europacific Partners</div></div></body></html>`;
    } else return;

    const fromEmail = process.env.SENDGRID_FROM || 'vivian@2sa.com.au';
    const fromName  = process.env.SENDGRID_FROM_NAME || 'CCEP 3PL Portal';
    console.log('[sendOrderEmail] sending', type, 'to', JSON.stringify(recipients), 'from', fromEmail, 'apiKey exists:', !!apiKey);
    const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: recipients.map(r => ({ email: r })) }],
        from: { email: fromEmail, name: fromName },
        subject,
        content: [{ type: 'text/html', value: html }],
      }),
    });
    const sgBody = await sgRes.text();
    console.log('[sendOrderEmail] status', sgRes.status, sgBody || '(no body = success)');
  } catch (e) {
    console.error('[sendOrderEmail] error:', e.message, 'stack:', e.stack?.split('\n')[0]);
  }
}

function generateManualOrderNumber() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  return `MAN-${y}${m}${d}-${hh}${mm}${ss}`;
}

async function pushToShipStation(order) {
  const apiKey = process.env.SHIPSTATION_API_KEY;
  const apiSecret = process.env.SHIPSTATION_API_SECRET;
  if (!apiKey || !apiSecret) {
    return { pushed: false, reason: 'ShipStation credentials not configured' };
  }

  // SS createorder payload — 不传 null 字段，SS 会报 "request is invalid"
  const storeId = process.env.SHIPSTATION_STORE_ID ? Number(process.env.SHIPSTATION_STORE_ID) : null;
  const payload = {
    orderNumber:     order.order_number,
    orderDate:       new Date().toISOString(),
    orderStatus:     'awaiting_shipment',
    ...(order.reference_no && { orderKey: order.reference_no }),
    ...(order.customer_email && { customerEmail: order.customer_email }),
    ...(order.reference_no || order.ship_to_name
      ? { customerUsername: order.reference_no || order.ship_to_name }
      : {}),
    billTo: {
      name:       order.ship_to_name          || '',
      ...(order.customer_company && { company: order.customer_company }),
      street1:    order.ship_to_address?.address1 || '',
      ...(order.ship_to_address?.address2 && { street2: order.ship_to_address.address2 }),
      city:       order.ship_to_address?.suburb   || '',
      state:      order.ship_to_address?.state    || '',
      postalCode: order.ship_to_address?.postcode || '',
      country:    'AU', // SS 要求2位国家代码
      ...(order.customer_phone && { phone: order.customer_phone }),
    },
    shipTo: {
      name:       order.ship_to_name          || '',
      ...(order.customer_company && { company: order.customer_company }),
      street1:    order.ship_to_address?.address1 || '',
      ...(order.ship_to_address?.address2 && { street2: order.ship_to_address.address2 }),
      city:       order.ship_to_address?.suburb   || '',
      state:      order.ship_to_address?.state    || '',
      postalCode: order.ship_to_address?.postcode || '',
      country:    'AU', // SS 要求2位国家代码
      ...(order.customer_phone && { phone: order.customer_phone }),
    },
    items: (order.items || []).map(it => ({
      sku:       it.sku,
      name:      it.product_name || it.sku || 'Item',
      quantity:  Number(it.quantity) || 1,
      unitPrice: Number(it.price || 0),
    })),
    confirmation: 'none',
    ...(storeId && { advancedOptions: { storeId } }),
  };

  const authHeader = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;
  const res = await fetch('https://ssapi.shipstation.com/orders/createorder', {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    // 返回完整错误信息，包括 ModelState（字段验证错误）
    const reason = json?.Message || json?.message || `ShipStation HTTP ${res.status}`;
    const details = json?.ModelState
      ? Object.entries(json.ModelState).map(([k,v]) => `${k}: ${v}`).join('; ')
      : (json?.ExceptionMessage || json?.StackTrace || '');
    return { pushed: false, reason: details ? `${reason} — ${details}` : reason, raw: json };
  }
  return { pushed: true, shipstationOrderId: json?.orderId, orderNumber: json?.orderNumber, data: json };
}

export default async function handler(req, res) {
  const supabase = getSupabase();

  if (req.method === 'GET') {
    const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize || '100', 10) || 100));
    const q = String(req.query.q || '').trim();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // ── Access control ────────────────────────────────────────
    const authHeader           = (req.headers.authorization || '').replace('Bearer ', '');
    const tokenData            = verifyToken(authHeader);
    const allowedBillingGroups = tokenData?.allowed_billing_groups || [];
    const isSuperAdmin         = tokenData?.role === 'super_admin';
    const currentUsername      = tokenData?.sub || null;

    // Billing-group-based filter
    // Non-super-admin with no billing groups = no access
    let allowedSkus = null; // null = unrestricted (super admin only)
    if (!isSuperAdmin) {
      if (allowedBillingGroups.length === 0) {
        // No billing groups → return empty (unless view_all_orders)
        const hasViewAll = (tokenData?.permissions || []).includes('view_all_orders');
        if (!hasViewAll) {
          allowedSkus = []; // will be handled by project filter below
        }
      } else {
        const { data: bgProds } = await supabase
          .from('products')
          .select('sku')
          .in('billing_group', allowedBillingGroups);
        allowedSkus = (bgProds || []).map(p => p.sku);
      }
    }

    // First fetch all matching orders (with items) then do fuzzy filter in JS
    // because Supabase doesn't support cross-table OR filtering easily
    let query = supabase
      .from('orders')
      .select('*, order_items (sku, product_name, quantity, notes)', { count: 'exact' })
      .ilike('order_number', 'MAN-%')
      .order('created_at', { ascending: false });

    // Non-super-admin users only see their own orders
    // unless they have 'view_all_orders' permission
    const canViewAll = isSuperAdmin || (tokenData?.permissions || []).includes('view_all_orders');
    if (!canViewAll && currentUsername) {
      // Only show orders placed by this user
      // NULL created_by_username (legacy orders) are NOT shown to restricted users
      query = query.eq('created_by_username', currentUsername);
    } else if (!canViewAll) {
      // No username in token — show nothing
      query = query.eq('created_by_username', '__no_match__');
    }

    if (q) {
      // Server-side filter on order-level fields (fast, indexed)
      query = query.or(
        `order_number.ilike.%${q}%,` +
        `reference_no.ilike.%${q}%,` +
        `ship_to_name.ilike.%${q}%,` +
        `notes.ilike.%${q}%`
      );
    }

    const { data: rawData, error, count } = await query.range(from, to);
    if (error) return res.status(500).json({ error: error.message });

    // Client-side fuzzy filter on product SKU / product_name within items
    let data = rawData || [];
    if (q && data.length > 0) {
      const ql = q.toLowerCase();
      // Include orders where any item SKU or product_name matches
      // (supplement the server-side filter — server already matched order-level fields)
      const serverMatchIds = new Set(data.map(o => o.id));
      // For items-level match we need to fetch separately if there were orders
      // that didn't match server-side but have matching items — 
      // simpler: also fetch all and filter, capped at 500 for performance
      const { data: allOrders } = await supabase
        .from('orders')
        .select('*, order_items (sku, product_name, quantity, notes)')
        .ilike('order_number', 'MAN-%')
        .order('created_at', { ascending: false })
        .limit(500);

      const itemMatches = (allOrders || []).filter(o => {
        if (serverMatchIds.has(o.id)) return false; // already included
        return (o.order_items || []).some(it =>
          (it.sku || '').toLowerCase().includes(ql) ||
          (it.product_name || '').toLowerCase().includes(ql)
        );
      });
      data = [...data, ...itemMatches];
    }
    // Billing group access filter
    if (!isSuperAdmin && allowedBillingGroups.length > 0) {
      data = data.filter(order =>
        // Match by order.project_id (new orders)
        // Match by SKU billing group
        (order.order_items || []).some(it => allowedSkus && allowedSkus.includes(it.sku))
      );
    }

    const finalCount = q ? data.length : (count || 0);
    // Apply pagination manually when we did client-side merge
    const paginatedData = q ? data.slice(from, from + pageSize) : data;
    return res.status(200).json({
      success: true,
      data: paginatedData || [],
      pagination: { total: finalCount || 0, page, pageSize, totalPages: Math.ceil((finalCount || 0) / pageSize) },
    });
  }

  if (req.method === 'POST') {
    const auth     = req.headers.authorization || '';
    const token    = auth.replace('Bearer ', '');
    const postUser = verifyToken(token);
    if (!postUser) return res.status(401).json({ error: 'Unauthorized' });
    const createdBy = postUser.sub || null;

    const {
      reference_no = '',
      billing_group = '',
      client = 'ASL',
      ship_to_name,
      customer_company = '',
      customer_phone = '',
      customer_email = '',
      ship_to_address,
      notes = '',
      items = [],
      push_to_shipstation: rawPushSS = false,
      project_id = null,
      notify_recipient = false,
    } = req.body || {};
    // Only allow push if user has manual_push_ss permission or is super_admin
    const canPushSS = postUser.role === 'super_admin' || (postUser.permissions || []).includes('manual_push_ss');
    const push_to_shipstation = canPushSS && rawPushSS;

    if (!ship_to_name || !ship_to_address?.address1 || !ship_to_address?.suburb || !ship_to_address?.state || !ship_to_address?.postcode || !ship_to_address?.country) {
      return res.status(400).json({ error: 'Missing required recipient/address fields' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one line item is required' });
    }
    // client is mapped to ASL if not valid — no hard validation needed

    const order_number = generateManualOrderNumber();
    const orderPayload = {
      order_number,
      reference_no: reference_no || null,
      order_type: 'standard',
      status: 'pending',
      client,
      warehouse: 'BOTH',
      ship_to_name,
      ship_to_address,
      notes: `[MANUAL] ${notes || ''}`.trim(),
      customer_company,
      customer_phone,
      customer_email,
      items,
    };

    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        order_number: orderPayload.order_number,
        reference_no: orderPayload.reference_no,
        order_type: orderPayload.order_type,
        status: orderPayload.status,
        client: orderPayload.client,
        warehouse: orderPayload.warehouse,
        ship_to_name: orderPayload.ship_to_name,
        ship_to_address: orderPayload.ship_to_address,
        notes:      orderPayload.notes,
        ...(project_id    ? { project_id }    : {}),
        ...(billing_group  ? { billing_group }  : {}),
        ...(createdBy      ? { created_by_username: createdBy } : {}),
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    const lineItems = items
      .filter(it => it?.sku && Number(it?.quantity) > 0)
      .map(it => ({
        order_id: order.id,
        sku: String(it.sku).trim(),
        product_name: String(it.product_name || '').trim(),
        quantity: Number(it.quantity),
        notes: it.price != null ? `price:${it.price}` : null,
      }));
    if (lineItems.length === 0) {
      return res.status(400).json({ error: 'Line items must include sku and quantity' });
    }
    const { error: itemError } = await supabase.from('order_items').insert(lineItems);
    if (itemError) return res.status(500).json({ error: itemError.message });

    // 下单成功后立即扣减缓存库存
    await deductStock(supabase, lineItems);

    let shipstation = { pushed: false, reason: 'disabled' };
    if (push_to_shipstation) {
      shipstation = await pushToShipStation(orderPayload);
    }

    // Send order confirmation emails
    const notifyEmail   = process.env.NOTIFY_EMAIL || 'link@2sa.com.au';
    const userEmail     = postUser.email || null;
    const fullOrderData = {
      ...order,
      order_items: lineItems.map(it => ({ sku: it.sku, product_name: it.product_name, quantity: it.quantity })),
      ship_to_address:  orderPayload.ship_to_address,
      customer_company,
    };
    // Build recipient list for confirmation email
    const confirmRecipients = [];
    // Always send to the logged-in user's own email
    if (userEmail && userEmail.includes('@')) confirmRecipients.push(userEmail);
    // Optionally also send to the recipient email filled in the order
    if (notify_recipient && customer_email && customer_email.includes('@') && customer_email !== userEmail) {
      confirmRecipients.push(customer_email);
    }

    // await both emails so Vercel doesn't kill them before they complete
    await Promise.allSettled([
      ...(confirmRecipients.length > 0 ? [sendOrderEmail('order_confirmation', fullOrderData, confirmRecipients)] : []),
      sendOrderEmail('order_notification', fullOrderData, [notifyEmail]),
    ]);

    return res.status(201).json({
      success: true,
      data: order,
      shipstation,
    });
  }


  if (req.method === 'PATCH') {
    const auth  = req.headers.authorization || '';
    const token = auth.replace('Bearer ', '');
    if (!verifyToken(token)) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Order id required' });

    const {
      reference_no, tracking_number, carrier, status, notes, push_to_shipstation,
      ship_to_name, customer_company, customer_phone, customer_email, ship_to_address,
      items, // array of {sku, product_name, quantity} — if provided, replaces all items
      project_id: patchProjectId,
    } = req.body || {};

    const updates = {};
    if (reference_no      !== undefined) updates.reference_no      = reference_no;
    if (tracking_number   !== undefined) updates.tracking_number   = tracking_number;
    if (carrier           !== undefined) updates.carrier           = carrier;
    if (status            !== undefined) updates.status            = status;
    if (notes             !== undefined) updates.notes             = notes;
    if (ship_to_name      !== undefined) updates.ship_to_name      = ship_to_name;
    if (customer_company  !== undefined) updates.customer_company  = customer_company;
    if (customer_phone    !== undefined) updates.customer_phone    = customer_phone;
    if (customer_email    !== undefined) updates.customer_email    = customer_email;
    if (ship_to_address   !== undefined) updates.ship_to_address   = ship_to_address;
    if (patchProjectId    !== undefined) updates.project_id        = patchProjectId || null;
    if (req.body?.billing_group  !== undefined) updates.billing_group  = req.body.billing_group  || null;
    if (req.body?.tracking_link          !== undefined) updates.tracking_link          = req.body.tracking_link          || null;
    if (req.body?.project_tracking_note  !== undefined) updates.project_tracking_note  = req.body.project_tracking_note  || null;

    const { data: order, error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', id)
      .ilike('order_number', 'MAN-%')
      .select('*, order_items(sku, product_name, quantity, notes)')
      .single();
    
    if (error) return res.status(500).json({ error: error.message });
    if (!order) return res.status(404).json({ error: 'Manual order not found' });

    // Replace order items if provided
    let finalOrder = order;
    if (Array.isArray(items)) {
      await supabase.from('order_items').delete().eq('order_id', id);
      const newItems = items
        .filter(it => it?.sku && Number(it?.quantity) > 0)
        .map(it => ({
          order_id:     id,
          sku:          String(it.sku).trim(),
          product_name: String(it.product_name || '').trim(),
          quantity:     Number(it.quantity),
        }));
      if (newItems.length > 0) {
        const { error: insertErr } = await supabase.from('order_items').insert(newItems);
        if (insertErr) console.error('[manual PATCH] insert items error:', insertErr.message);
      }
      // Re-fetch so response includes updated order_items
      const { data: refreshed } = await supabase
        .from('orders')
        .select('*, order_items(sku, product_name, quantity, notes)')
        .eq('id', id)
        .single();
      if (refreshed) finalOrder = refreshed;
    }

    // Optionally re-push to ShipStation
    let shipstation = { pushed: false, reason: 'not requested' };
    if (push_to_shipstation) {
      const orderPayload = {
        order_number: order.order_number,
        reference_no: order.reference_no,
        ship_to_name: order.ship_to_name,
        ship_to_address: order.ship_to_address,
        customer_phone: order.customer_phone,
        customer_email: order.customer_email,
        customer_company: order.customer_company,
        items: order.order_items || [],
      };
      shipstation = await pushToShipStation(orderPayload);
    }

    // Send shipping notification if tracking was added and status is shipped
    if (tracking_number && finalOrder?.status === 'shipped') {
      // Get the order creator's email from admin_users (reuse existing supabase instance)
      const createdBy = finalOrder.created_by_username;
      let placerEmail = null;
      if (createdBy) {
        const { data: placerUser } = await supabase
          .from('admin_users')
          .select('email')
          .eq('username', createdBy)
          .single();
        placerEmail = placerUser?.email || null;
      }

      const shippingRecipients = [];
      if (placerEmail && placerEmail.includes('@')) shippingRecipients.push(placerEmail);

      if (shippingRecipients.length > 0) {
        await sendOrderEmail('shipping_notification', {
          ...finalOrder,
          ship_to_address: finalOrder.ship_to_address,
        }, shippingRecipients);
      }
    }

    return res.status(200).json({ success: true, data: finalOrder, shipstation });
  }


  // Bulk upload: POST with { bulk: true, orders: [...] }
  if (req.method === 'POST' && req.body?.bulk) {
    const auth      = req.headers.authorization || '';
    const token     = auth.replace('Bearer ', '');
    const bulkUser  = verifyToken(token);
    if (!bulkUser) return res.status(401).json({ error: 'Unauthorized' });
    const bulkCreatedBy = bulkUser.sub || null;

    const { orders: bulkOrders = [], push_to_shipstation = false } = req.body;
    if (!Array.isArray(bulkOrders) || bulkOrders.length === 0) {
      return res.status(400).json({ error: 'No orders provided' });
    }

    const results = [];

    for (const row of bulkOrders) {
      try {
        const {
          reference_no = '',
          client = 'ASL',
          ship_to_name,
          customer_company = '',
          customer_phone = '',
          customer_email = '',
          ship_to_address,
          notes = '',
          items = [],
          status: rowStatus,
          project_id: rowProjectId,
          billing_group: rowBillingGroup,
        } = row;

        if (!ship_to_name || !ship_to_address?.address1 || !ship_to_address?.suburb || !ship_to_address?.state || !ship_to_address?.postcode) {
          results.push({ reference_no, success: false, error: 'Missing required fields' });
          continue;
        }
        if (!Array.isArray(items) || items.length === 0) {
          results.push({ reference_no, success: false, error: 'No items' });
          continue;
        }

        const order_number = generateManualOrderNumber();
        const orderPayload = {
          order_number,
          reference_no: reference_no || null,
          order_type: 'standard',
          status: 'pending',
          client: ['ASL','CCEP'].includes(client) ? client : 'ASL',
          warehouse: 'BOTH',
          ship_to_name,
          ship_to_address: { ...ship_to_address, country: ship_to_address.country || 'AU' },
          notes: `[MANUAL] ${notes || ''}`.trim(),
          customer_company,
          customer_phone,
          customer_email,
          items,
        };

        const { data: order, error } = await supabase
          .from('orders')
          .insert({
            order_number: orderPayload.order_number,
            reference_no: orderPayload.reference_no,
            order_type:   orderPayload.order_type,
            status:       rowStatus || orderPayload.status,
            client:       orderPayload.client,
            warehouse:    orderPayload.warehouse,
            ship_to_name: orderPayload.ship_to_name,
            ship_to_address: orderPayload.ship_to_address,
            notes:        orderPayload.notes,
            ...(rowProjectId    ? { project_id:    rowProjectId }    : {}),
            ...(rowBillingGroup ? { billing_group: rowBillingGroup }   : {}),
            ...(bulkCreatedBy   ? { created_by_username: bulkCreatedBy } : {}),
          })
          .select()
          .single();

        if (error) { results.push({ reference_no, success: false, error: error.message }); continue; }

        const lineItems = items
          .filter(it => it?.sku && Number(it?.quantity) > 0)
          .map(it => ({
            order_id:     order.id,
            sku:          String(it.sku).trim(),
            product_name: String(it.product_name || '').trim(),
            quantity:     Number(it.quantity),
            notes:        it.price != null ? `price:${it.price}` : null,
          }));

        if (lineItems.length > 0) {
          await supabase.from('order_items').insert(lineItems);
          // 下单成功后立即扣减缓存库存
          await deductStock(supabase, lineItems);
        }

        let shipstation = { pushed: false, reason: 'disabled' };
        if (push_to_shipstation) {
          shipstation = await pushToShipStation(orderPayload);
        }

        results.push({ reference_no, order_number, success: true, shipstation });

        // Small delay to avoid overwhelming SS
        if (push_to_shipstation) await new Promise(r => setTimeout(r, 200));

      } catch (e) {
        results.push({ reference_no: row.reference_no, success: false, error: e.message });
      }
    }

    const created = results.filter(r => r.success).length;
    const failed  = results.filter(r => !r.success).length;
    return res.status(201).json({ success: true, created, failed, results });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
