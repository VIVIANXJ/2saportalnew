/**
 * /api/projects
 * Project management — super admin only for write, all admins can read
 *
 * GET    → list all projects (with SKU count per project)
 * POST   → create project
 * PATCH  → update project (?id=xxx)
 * DELETE → deactivate project (?id=xxx)
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
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const user  = verifyToken(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const supabase    = getSupabase();
  const isSuperAdmin = user.role === 'super_admin';

  // ── GET: list projects with SKU counts ───────────────────────
  if (req.method === 'GET') {
    const { data: projects, error } = await supabase
      .from('projects')
      .select('*')
      .order('name', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    // Count SKUs per project
    const { data: counts } = await supabase
      .from('products')
      .select('project_id')
      .not('project_id', 'is', null);

    const skuCountMap = {};
    (counts || []).forEach(p => {
      skuCountMap[p.project_id] = (skuCountMap[p.project_id] || 0) + 1;
    });

    const result = (projects || []).map(p => ({
      ...p,
      sku_count: skuCountMap[p.id] || 0,
    }));

    return res.status(200).json({ success: true, data: result });
  }

  // Write operations require super_admin
  if (!isSuperAdmin) return res.status(403).json({ error: 'Super admin access required' });

  // ── POST: create project ──────────────────────────────────────
  if (req.method === 'POST') {
    const { name, description = '' } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'Project name required' });

    const { data, error } = await supabase
      .from('projects')
      .insert({ name: name.trim(), description })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: `Project "${name}" already exists` });
      return res.status(500).json({ error: error.message });
    }
    return res.status(201).json({ success: true, data });
  }

  // ── PATCH: update project ─────────────────────────────────────
  if (req.method === 'PATCH') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Project id required' });

    const { name, description, active } = req.body || {};
    const updates = {};
    if (name        !== undefined) updates.name        = name;
    if (description !== undefined) updates.description = description;
    if (active      !== undefined) updates.active      = active;

    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, data });
  }

  // ── DELETE: deactivate project ────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Project id required' });

    const { error } = await supabase
      .from('projects')
      .update({ active: false })
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
