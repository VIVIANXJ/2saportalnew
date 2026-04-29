/**
 * /api/auth/users
 * User management — super admin only
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

  // ── GET ──────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('admin_users')
      .select('id, username, email, permissions, active, created_at, notes, allowed_billing_groups')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, data: data || [], all_permissions: ALL_PERMISSIONS });
  }

  // ── POST: create user ─────────────────────────────────────────
  if (req.method === 'POST') {
    const { username, password, permissions = [], notes = '', allowed_billing_groups = [], email = '' } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    if (username === (process.env.ADMIN_USERNAME || '2sa-admin')) {
      return res.status(400).json({ error: 'Cannot create user with super admin username' });
    }
    const { data: existing } = await supabase
      .from('admin_users').select('id').eq('username', username).single();
    if (existing) return res.status(409).json({ error: 'Username already exists' });

    const { data, error } = await supabase
      .from('admin_users')
      .insert({
        username,
        email: email || null,
        password_hash: hashPassword(password),
        permissions,
        active: true,
        notes,
        allowed_billing_groups: allowed_billing_groups.map(String),
      })
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ success: true, data });
  }

  // ── PATCH: update user ────────────────────────────────────────
  if (req.method === 'PATCH') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'User id required' });

    const { password, permissions, active, notes, allowed_billing_groups, email } = req.body || {};

    // Build update object — all fields in one update call
    const updates = {};
    if (permissions             !== undefined) updates.permissions             = permissions;
    if (email                  !== undefined) updates.email                  = email || null;
    if (active                  !== undefined) updates.active                  = active;
    if (notes                   !== undefined) updates.notes                   = notes;
    if (allowed_billing_groups  !== undefined) updates.allowed_billing_groups  = allowed_billing_groups.map(String);
    if (password)                              updates.password_hash            = hashPassword(password);

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    // Single update call with all fields including arrays
    const { error } = await supabase
      .from('admin_users')
      .update(updates)
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });

    // Re-fetch to return fresh data
    const { data, error: fetchErr } = await supabase
      .from('admin_users')
      .select('id, username, email, permissions, active, created_at, notes, allowed_billing_groups')
      .eq('id', id)
      .single();

    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    return res.status(200).json({ success: true, data });
  }

  // ── DELETE: deactivate ────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'User id required' });
    const { error } = await supabase
      .from('admin_users').update({ active: false }).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
