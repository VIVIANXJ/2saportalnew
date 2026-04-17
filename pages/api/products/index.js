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
    const { q, all, limit = '500' } = req.query;
    let query = supabase
      .from('products')
      .select('id, sku, product_name, description, active')
      .order('sku', { ascending: true })
      .limit(parseInt(limit));

    if (!all) query = query.eq('active', true);
    if (q?.trim()) query = query.or(`sku.ilike.%${q.trim()}%,product_name.ilike.%${q.trim()}%`);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, count: data.length, data: data || [] });
  }

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!verifyToken(token)) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'POST') {
    const { sku, product_name, description = '' } = req.body || {};
    if (!sku?.trim() || !product_name?.trim()) return res.status(400).json({ error: 'SKU and product_name required' });
    const { data, error } = await supabase
      .from('products').insert({ sku: sku.trim(), product_name: product_name.trim(), description })
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
    const { sku, product_name, description, active } = req.body || {};
    const updates = {};
    if (sku !== undefined)          updates.sku          = sku.trim();
    if (product_name !== undefined) updates.product_name = product_name.trim();
    if (description !== undefined)  updates.description  = description;
    if (active !== undefined)       updates.active       = active;
    const { data, error } = await supabase.from('products').update(updates).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, data });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await supabase.from('products').update({ active: false }).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
