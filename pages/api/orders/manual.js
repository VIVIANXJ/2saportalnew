import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '../auth/login';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
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
    let query = supabase
      .from('orders')
      .select('*, order_items (sku, product_name, quantity, notes)', { count: 'exact' })
      .ilike('order_number', 'MAN-%')
      .order('created_at', { ascending: false });
    if (q) {
      query = query.or(`order_number.ilike.%${q}%,reference_no.ilike.%${q}%`);
    }
    const { data, error, count } = await query.range(from, to);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({
      success: true,
      data: data || [],
      pagination: { total: count || 0, page, pageSize, totalPages: Math.ceil((count || 0) / pageSize) },
    });
  }

  if (req.method === 'POST') {
    const auth  = req.headers.authorization || '';
    const token = auth.replace('Bearer ', '');
    if (!verifyToken(token)) return res.status(401).json({ error: 'Unauthorized' });

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
      push_to_shipstation = true,
    } = req.body || {};

    if (!ship_to_name || !ship_to_address?.address1 || !ship_to_address?.suburb || !ship_to_address?.state || !ship_to_address?.postcode || !ship_to_address?.country) {
      return res.status(400).json({ error: 'Missing required recipient/address fields' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one line item is required' });
    }
    if (!['ASL', 'CCEP'].includes(client)) {
      return res.status(400).json({ error: 'client must be ASL or CCEP' });
    }

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
        notes: orderPayload.notes,
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

    let shipstation = { pushed: false, reason: 'disabled' };
    if (push_to_shipstation) {
      shipstation = await pushToShipStation(orderPayload);
    }

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

    const { reference_no, tracking_number, carrier, status, notes, push_to_shipstation } = req.body || {};

    const updates = {};
    if (reference_no  !== undefined) updates.reference_no  = reference_no;
    if (tracking_number !== undefined) updates.tracking_number = tracking_number;
    if (carrier       !== undefined) updates.carrier       = carrier;
    if (status        !== undefined) updates.status        = status;
    if (notes         !== undefined) updates.notes         = notes;

    const { data: order, error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', id)
      .ilike('order_number', 'MAN-%')
      .select('*, order_items(sku, product_name, quantity, notes)')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!order) return res.status(404).json({ error: 'Manual order not found' });

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

    return res.status(200).json({ success: true, data: order, shipstation });
  }


  // Bulk upload: POST with { bulk: true, orders: [...] }
  if (req.method === 'POST' && req.body?.bulk) {
    const auth  = req.headers.authorization || '';
    const token = auth.replace('Bearer ', '');
    if (!verifyToken(token)) return res.status(401).json({ error: 'Unauthorized' });

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
            status:       orderPayload.status,
            client:       orderPayload.client,
            warehouse:    orderPayload.warehouse,
            ship_to_name: orderPayload.ship_to_name,
            ship_to_address: orderPayload.ship_to_address,
            notes:        orderPayload.notes,
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
