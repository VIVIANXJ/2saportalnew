/**
 * /api/warehouse/stock-check
 * 快速查询指定 SKU 的当前 sellable 库存（从缓存读取）
 *
 * GET  ?skus=SKU1,SKU2,SKU3
 * POST { skus: ['SKU1', 'SKU2'] }
 *
 * 返回: { success: true, stock: { 'SKU1': 10, 'SKU2': 0, 'SKU3': 5 } }
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  let skus = [];

  if (req.method === 'GET') {
    skus = (req.query.skus || '').split(',').map(s => s.trim()).filter(Boolean);
  } else if (req.method === 'POST') {
    skus = (req.body?.skus || []).map(s => String(s).trim()).filter(Boolean);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (skus.length === 0) {
    return res.status(200).json({ success: true, stock: {} });
  }

  // Deduplicate
  skus = [...new Set(skus)];

  try {
    const { data, error } = await supabase
      .from('inventory_cache')
      .select('sku, sellable')
      .in('sku', skus);

    if (error) return res.status(500).json({ error: error.message });

    // Sum sellable across all warehouses per SKU
    const stock = {};
    skus.forEach(s => { stock[s] = 0; }); // default 0 for all requested
    (data || []).forEach(row => {
      stock[row.sku] = (stock[row.sku] || 0) + (row.sellable || 0);
    });

    return res.status(200).json({ success: true, stock });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
