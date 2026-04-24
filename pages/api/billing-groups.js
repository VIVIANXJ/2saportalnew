/**
 * /api/billing-groups
 * Billing Group CRUD — super admin only for write
 *
 * GET    → list all (active only by default, ?all=1 for all)
 * POST   → create { name }
 * PATCH  → update ?id=xxx { name?, active? }
 * DELETE → delete ?id=xxx
 */
import { createClient } from '@supabase/supabase-js';
import { verifyToken } from './auth/login';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const user  = verifyToken(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // ── GET ──────────────────────────────────────────────────────
  if (req.method === 'GET') {
    let query = supabase
      .from('billing_groups')
      .select('id, name, active, created_at')
      .order('name', { ascending: true });

    // ?all=1 shows inactive too (for management UI)
    if (req.query.all !== '1') {
      query = query.eq('active', true);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, data: data || [] });
  }

  // Write operations: super_admin only
  const isSuperAdmin = user.role === 'super_admin';
  if (!isSuperAdmin) return res.status(403).json({ error: 'Super admin required' });

  // ── POST: create ─────────────────────────────────────────────
  if (req.method === 'POST') {
    const { name } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });

    const { data, error } = await supabase
      .from('billing_groups')
      .insert({ name: name.trim() })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: `"${name}" already exists` });
      return res.status(500).json({ error: error.message });
    }
    return res.status(201).json({ success: true, data });
  }

  // ── PATCH: update ─────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });

    const { name, active } = req.body || {};
    const updates = {};
    if (name   !== undefined) updates.name   = name.trim();
    if (active !== undefined) updates.active = active;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    // If renaming, also update all products + orders with old name
    if (name !== undefined) {
      const { data: old } = await supabase
        .from('billing_groups')
        .select('name')
        .eq('id', id)
        .single();

      if (old?.name && old.name !== name.trim()) {
        // Update products
        await supabase
          .from('products')
          .update({ billing_group: name.trim() })
          .eq('billing_group', old.name);
        // Update orders
        await supabase
          .from('orders')
          .update({ billing_group: name.trim() })
          .eq('billing_group', old.name);
      }
    }

    const { data, error } = await supabase
      .from('billing_groups')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, data });
  }

  // ── DELETE ────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });

    const { error } = await supabase
      .from('billing_groups')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
