import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const JWT_SECRET      = process.env.JWT_SECRET || 'change-me-in-production';
const SUPER_ADMIN     = process.env.ADMIN_USERNAME || '2sa-admin';
const SUPER_ADMIN_PASS = process.env.ADMIN_PASSWORD;

// All available permission modules
export const ALL_PERMISSIONS = [
  'manual_orders',   // View Manual Orders list
  'manual_create',   // Create single Manual Order
  'manual_bulk',     // Bulk upload Manual Orders
  'eccang_orders',   // View ECCANG Orders
  'jdl_orders',      // View JDL Orders
  'order_type',      // Order Type settings
  'inventory',       // View Inventory
  'tracking',        // Update Tracking (ECCANG)
  'sync_eccang',     // Sync ECCANG Orders
  'user_management', // Manage admin users (super admin only)
];

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function makeToken(username, role, permissions) {
  const payload = Buffer.from(JSON.stringify({
    sub:         username,
    role,
    permissions: permissions || [],
    iat:         Date.now(),
    exp:         Date.now() + 86400000, // 24h
  })).toString('base64');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifyToken(token) {
  try {
    const [payload, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
    if (sig !== expected) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64').toString());
    if (Date.now() > data.exp) return null;
    return data;
  } catch { return null; }
}

// Check if token has a specific permission
export function hasPermission(token, permission) {
  const data = verifyToken(token);
  if (!data) return false;
  if (data.role === 'super_admin') return true; // super admin has all permissions
  return (data.permissions || []).includes(permission);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  // Super admin login (from env vars)
  if (username === SUPER_ADMIN) {
    if (!SUPER_ADMIN_PASS) return res.status(500).json({ error: 'ADMIN_PASSWORD not configured' });
    if (password !== SUPER_ADMIN_PASS) return res.status(401).json({ error: 'Invalid credentials' });
    const token = makeToken(username, 'super_admin', ALL_PERMISSIONS);
    return res.status(200).json({
      success: true, token,
      user: { username, role: 'super_admin', permissions: ALL_PERMISSIONS },
    });
  }

  // Sub-admin login (from Supabase)
  try {
    const supabase = getSupabase();
    const { data: user, error } = await supabase
      .from('admin_users')
      .select('*')
      .eq('username', username)
      .eq('active', true)
      .single();

    if (error || !user) return res.status(401).json({ error: 'Invalid credentials' });

    // Verify password (SHA256 hash)
    const hashedInput = crypto.createHash('sha256').update(password).digest('hex');
    if (hashedInput !== user.password_hash) return res.status(401).json({ error: 'Invalid credentials' });

    const permissions = user.permissions || [];
    const token = makeToken(username, 'admin', permissions);
    return res.status(200).json({
      success: true, token,
      user: { username, role: 'admin', permissions },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
