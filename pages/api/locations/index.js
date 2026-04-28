/**
 * /api/locations
 * Address book CRUD
 *
 * GET ?q=xxx     → search by name/company (for dropdown)
 * GET ?all=1     → include inactive
 * POST           → create
 * PATCH ?id=xxx  → update
 * DELETE ?id=xxx → deactivate
 */
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

  // GET — needs auth
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!verifyToken(token)) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const { q, all, page = '1', pageSize = '100' } = req.query;
    const pg   = Math.max(1, parseInt(page));
    const size = Math.min(200, Math.max(1, parseInt(pageSize)));
    const from = (pg - 1) * size;
    const to   = from + size - 1;

    let query = supabase
      .from('locations')
      .select('*', { count: 'exact' })
      .order('name', { ascending: true });

    if (!all) query = query.eq('active', true);
    if (q?.trim()) {
      query = query.or(`name.ilike.%${q.trim()}%,company.ilike.%${q.trim()}%,suburb.ilike.%${q.trim()}%,address1.ilike.%${q.trim()}%`);
    }

    // For dropdown: no pagination
    if (req.query.dropdown === '1') {
      query = query.limit(50);
      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true, data: data || [] });
    }

    query = query.range(from, to);
    const { data, error, count } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({
      success: true,
      count:   count || 0,
      page: pg,
      totalPages: Math.ceil((count || 0) / size),
      data: data || [],
    });
  }

  if (req.method === 'POST') {
    const { name, company = '', address1 = '', address2 = '', suburb = '',
            state = '', postcode = '', country = 'AU', phone = '', email = '', notes = '', special_instruction = '',
            receiver_code = '', mobile = '', billing_group = '' } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const { data, error } = await supabase
      .from('locations')
      .insert({ name: name.trim(), company, address1, address2, suburb, state, postcode, country, phone, email, notes, special_instruction, receiver_code, mobile, billing_group })
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ success: true, data });
  }

  if (req.method === 'PATCH') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const fields = ['name','company','address1','address2','suburb','state','postcode','country','phone','email','notes','special_instruction','receiver_code','mobile','billing_group','active'];
    const updates = {};
    fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const { data, error } = await supabase.from('locations').update(updates).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, data });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await supabase.from('locations').update({ active: false }).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
