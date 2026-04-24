/**
 * /api/billing-groups
 * 返回所有 billing groups（供 User Management 选择用）
 * GET → { success: true, data: [{ id, name, active }] }
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { data, error } = await supabase
    .from('billing_groups')
    .select('id, name, active')
    .eq('active', true)
    .order('name', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ success: true, data: data || [] });
}
