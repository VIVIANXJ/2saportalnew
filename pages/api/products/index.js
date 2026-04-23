import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '../auth/login';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export default async function handler(req, res) {
  const supabase = getSupabase();

  if (req.method === 'GET') {
    const { q, all, page = '1', pageSize = '100', limit } = req.query;

    // SKU dropdown 用 limit 模式（不分页，拉全量）
    if (limit) {
      let query = supabase
        .from('products')
        .select('id, sku, product_name, project_id')
        .eq('active', true)
        .order('sku', { ascending: true })
        .limit(parseInt(limit));
        .limit(parseInt(limit));
      if (q?.trim()) query = query.or(`sku.ilike.%${q.trim()}%,product_name.ilike.%${q.trim()}%`);
      const projectFilter = (req.query.projects || '').split(',').filter(Boolean);
      if (projectFilter.length > 0) query = query.in('project_id', projectFilter);

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true, count: data.length, data: data || [] });
    }

    // 分页模式
    const pg   = Math.max(1, parseInt(page));
    const size = Math.min(200, Math.max(1, parseInt(pageSize)));
    const from = (pg - 1) * size;
    const to   = from + size - 1;

    let query = supabase
      .from('products')
      .select('id, sku, product_name, description, active, source, project_id', { count: 'exact' })
      .order('sku', { ascending: true })
      .range(from, to);

    if (!all) query = query.eq('active', true);
    if (q?.trim()) query = query.or(`sku.ilike.%${q.trim()}%,product_name.ilike.%${q.trim()}%`);

    const { data, error, count } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({
      success: true,
      count:   count || 0,
      page:    pg,
      pageSize: size,
      totalPages: Math.ceil((count || 0) / size),
      data:    data || [],
    });
  }

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!verifyToken(token)) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'POST') {
    const { sku, product_name, description = '', source, project_id } = req.body || {};
    if (!sku?.trim() || !product_name?.trim()) return res.status(400).json({ error: 'SKU and product_name required' });
    const { data, error } = await supabase
      .from('products')
      .insert({ sku: sku.trim(), product_name: product_name.trim(), description, source, ...(project_id ? { project_id } : {}) })
      .select().single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: `SKU "${sku}" already exists` });
      return res.status(500).json({ error: error.message });
    }
    return res.status(201).json({ success: true, data });
  }

  if (req.method === 'PATCH') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { active, source, project_id } = req.body || {};
    const updates = {};
    if (active     !== undefined) updates.active     = active;
    if (source     !== undefined) updates.source     = source;
    if (project_id !== undefined) updates.project_id = project_id || null;


    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, data });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
