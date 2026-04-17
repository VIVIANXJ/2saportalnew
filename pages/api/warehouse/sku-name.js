/**
 * /api/warehouse/sku-names
 * SKU → product_name 매핑 반환
 * 우선순위: products 테이블 > order_items 테이블
 */

import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function fromProductsTable() {
  const supabase = getSupabase();
  const map = {};
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('sku, product_name')
      .eq('active', true)
      .range(from, from + pageSize - 1);

    if (error || !data?.length) break;
    data.forEach(item => {
      if (item.sku && item.product_name) map[item.sku] = item.product_name;
    });
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return map;
}

async function fromOrderItems() {
  const supabase = getSupabase();
  const map = {};
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('order_items')
      .select('sku, product_name')
      .not('product_name', 'is', null)
      .neq('product_name', '')
      .range(from, from + pageSize - 1);

    if (error || !data?.length) break;
    data.forEach(item => {
      if (item.sku && item.product_name && !map[item.sku]) {
        map[item.sku] = item.product_name;
      }
    });
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return map;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 两个来源并行拉取
    const [productsResult, orderItemsResult] = await Promise.allSettled([
      fromProductsTable(),
      fromOrderItems(),
    ]);

    const productsMap   = productsResult.status   === 'fulfilled' ? productsResult.value   : {};
    const orderItemsMap = orderItemsResult.status === 'fulfilled' ? orderItemsResult.value : {};

    // products 테이블이 우선, order_items로 보완
    const combined = { ...orderItemsMap, ...productsMap };

    return res.status(200).json({
      success: true,
      count:   Object.keys(combined).length,
      sources: {
        products:    Object.keys(productsMap).length,
        order_items: Object.keys(orderItemsMap).length,
      },
      data: combined,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
