/**
 * /api/warehouse/inventory-cached
 *
 * 从 Supabase inventory_cache 表读取缓存数据（由 cron 每日刷新）。
 * 同时返回最后同步时间，供前端显示。
 *
 * 如果缓存为空（首次使用），自动回退到实时拉取。
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ── 1. 读缓存 ─────────────────────────────────────────────
    const { data: cacheRows, error } = await supabase
      .from('inventory_cache')
      .select('*')
      .order('sku', { ascending: true });

    if (error) throw new Error(error.message);

    // ── 2. 读最后同步时间 ─────────────────────────────────────
    const { data: logRows } = await supabase
      .from('inventory_sync_log')
      .select('synced_at, sku_count, status')
      .order('synced_at', { ascending: false })
      .limit(1);

    const lastSync = logRows?.[0] || null;

    // ── 3. 缓存为空时回退实时拉取 ─────────────────────────────
    if (!cacheRows || cacheRows.length === 0) {
      return res.status(200).json({
        success:    true,
        from_cache: false,
        last_sync:  null,
        data:       [],
        message:    'Cache empty — run manual sync first',
      });
    }

    // ── 4. 把扁平行重新组织成前端需要的 { sku, warehouses } 格式 ──
    const skuMap = {};
    for (const row of cacheRows) {
      if (!row.sku) continue;
      if (!skuMap[row.sku]) skuMap[row.sku] = { sku: row.sku, warehouses: {} };
      skuMap[row.sku].warehouses[row.warehouse_code] = {
        sellable:   row.sellable   || 0,
        reserved:   row.reserved   || 0,
        onway:      row.onway      || 0,
        unsellable: row.unsellable || 0,
        hold:       row.hold_qty   || 0,
      };
    }

    const data = Object.values(skuMap).map(entry => ({
      ...entry,
      total_sellable: Object.values(entry.warehouses)
        .reduce((s, w) => s + (w.sellable || 0), 0),
    }));

    return res.status(200).json({
      success:    true,
      from_cache: true,
      last_sync:  lastSync,
      count:      data.length,
      data,
    });

  } catch (err) {
    console.error('[inventory-cached]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
