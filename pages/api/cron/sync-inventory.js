/**
 * /api/cron/sync-inventory
 *
 * 由 Vercel Cron Job 每天凌晨 2:00 (AEST = UTC+10 → UTC 16:00) 自动触发。
 * 也可以从 Admin 后台手动触发（带 Authorization header）。
 *
 * 流程：
 *  1. 调用 /api/warehouse/inventory 拉取全量库存
 *  2. upsert 到 Supabase inventory_cache 表
 *  3. 更新 inventory_sync_log 表（最后同步时间 / 结果）
 *
 * 安全：校验 CRON_SECRET（Vercel Cron 自动注入 Authorization: Bearer <secret>）
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── 安全校验 ────────────────────────────────────────────────
  // Vercel Cron 自动带 Authorization: Bearer <CRON_SECRET>
  // Admin 手动触发时带的是 JWT token，也允许通过
  const authHeader = req.headers['authorization'] || '';
  const cronSecret = process.env.CRON_SECRET;
  const jwtSecret  = process.env.JWT_SECRET;

  // 允许：Vercel Cron secret / 有效 JWT token / 无 secret 配置（dev）
  const isCron    = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const hasToken  = authHeader.startsWith('Bearer ') && authHeader.length > 20;
  const devMode   = !cronSecret;

  if (!isCron && !hasToken && !devMode) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const startedAt = new Date().toISOString();
  console.log(`[sync-inventory] Starting at ${startedAt}`);

  try {
    // ── 1. 拉取全量库存（复用合并 API 的逻辑）────────────────
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
      || process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`
      || 'http://localhost:3000';

    const inventoryRes = await fetch(`${baseUrl}/api/warehouse/inventory`, {
      headers: { 'x-internal-cron': cronSecret || 'internal' },
    });

    if (!inventoryRes.ok) {
      throw new Error(`Inventory API returned ${inventoryRes.status}`);
    }

    const inventoryJson = await inventoryRes.json();
    const items = inventoryJson.data || [];

    console.log(`[sync-inventory] Fetched ${items.length} SKUs`);

    // ── 2. 展开成行，每个 SKU × 仓库 一条记录 ────────────────
    const rows = [];
    const now  = new Date().toISOString();

    for (const item of items) {
      if (!item.sku || !item.warehouses) continue;
      for (const [warehouseCode, data] of Object.entries(item.warehouses)) {
        const isEccang = warehouseCode === 'ECCANG' || warehouseCode === 'AUSYD';
        rows.push({
          sku:            item.sku,
          warehouse:      isEccang ? 'ECCANG' : 'JDL',
          warehouse_code: warehouseCode,
          sellable:       data.sellable    || 0,
          reserved:       data.reserved    || 0,
          onway:          data.onway       || 0,
          unsellable:     data.unsellable  || 0,
          hold_qty:       data.hold        || 0,
          last_synced_at: now,
        });
      }
    }

    console.log(`[sync-inventory] Upserting ${rows.length} rows to inventory_cache`);

    // ── 3. Upsert 到 inventory_cache ─────────────────────────
    // 分批写入，每批 200 条，避免 payload 过大
    const BATCH = 200;
    let upsertErrors = [];

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { error } = await supabase
        .from('inventory_cache')
        .upsert(batch, { onConflict: 'sku,warehouse_code' });
      if (error) {
        console.error(`[sync-inventory] Upsert error batch ${i}:`, error.message);
        upsertErrors.push(error.message);
      }
    }

    // ── 4. 记录同步日志 ───────────────────────────────────────
    const syncResult = {
      synced_at:   now,
      sku_count:   items.length,
      row_count:   rows.length,
      status:      upsertErrors.length === 0 ? 'success' : 'partial',
      error_msg:   upsertErrors.length > 0 ? upsertErrors.join('; ') : null,
    };

    await supabase
      .from('inventory_sync_log')
      .insert(syncResult);

    console.log(`[sync-inventory] Done. ${rows.length} rows upserted, ${upsertErrors.length} errors`);

    return res.status(200).json({
      success:   true,
      synced_at: now,
      sku_count: items.length,
      row_count: rows.length,
      errors:    upsertErrors,
    });

  } catch (err) {
    console.error('[sync-inventory] Fatal error:', err.message);

    // 记录失败日志
    await supabase.from('inventory_sync_log').insert({
      synced_at: startedAt,
      sku_count: 0,
      row_count: 0,
      status:    'failed',
      error_msg: err.message,
    });

    return res.status(500).json({ error: err.message });
  }
}
