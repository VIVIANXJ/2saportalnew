/**
 * /api/auth/users
 * User management — super admin only
 *
 * GET    → list all admin users
 * POST   → create new user
 * PATCH  → update user (password, permissions, active)
 * DELETE → deactivate user
 */
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { verifyToken, ALL_PERMISSIONS } from './login';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function requireSuperAdmin(req, res) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const data  = verifyToken(token);
  if (!data || data.role !== 'super_admin') {
    res.status(403).json({ error: 'Super admin access required' });
    return null;
  }
  return data;
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export default async function handler(req, res) {
  const admin = requireSuperAdmin(req, res);
  if (!admin) return;

  const supabase = getSupabase();

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('admin_users')
      .select('id, username, permissions, active, created_at, notes')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, data: data || [], all_permissions: ALL_PERMISSIONS });
  }

  if (req.method === 'POST') {
    const { username, password, permissions = [], notes = '' } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    if (username === (process.env.ADMIN_USERNAME || '2sa-admin')) {
      return res.status(400).json({ error: 'Cannot create user with super admin username' });
    }

    // Check username taken
    const { data: existing } = await supabase
      .from('admin_users')
      .select('id')
      .eq('username', username)
      .single();
    if (existing) return res.status(409).json({ error: 'Username already exists' });

    const { data, error } = await supabase
      .from('admin_users')
      .insert({ username, password_hash: hashPassword(password), permissions, active: true, notes })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ success: true, data });
  }

  if (req.method === 'PATCH') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'User id required' });

    const { password, permissions, active, notes } = req.body || {};
    const updates = {};
    if (permissions !== undefined) updates.permissions = permissions;
    if (active !== undefined)      updates.active      = active;
    if (notes !== undefined)       updates.notes       = notes;
    if (password)                  updates.password_hash = hashPassword(password);

    const { data, error } = await supabase
      .from('admin_users')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, data });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'User id required' });
    const { error } = await supabase
      .from('admin_users')
      .update({ active: false })
      .eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
