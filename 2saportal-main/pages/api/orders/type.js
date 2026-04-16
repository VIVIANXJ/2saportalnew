import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { order_numbers = [], order_type } = req.body || {};

  const normalisedType = String(order_type || '').toLowerCase();
  if (!['kitting', 'standard'].includes(normalisedType)) {
    return res.status(400).json({ error: 'order_type must be kitting or standard' });
  }

  const cleanNumbers = Array.from(
    new Set(
      (Array.isArray(order_numbers) ? order_numbers : [])
        .map(v => String(v || '').trim())
        .filter(Boolean)
    )
  );

  if (!cleanNumbers.length) {
    return res.status(400).json({ error: 'order_numbers is required' });
  }

  const supabase = getSupabase();

  try {
    const { data: updatedRows, error } = await supabase
      .from('orders')
      .update({ order_type: normalisedType })
      .in('order_number', cleanNumbers)
      .select('id, order_number, order_type');

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const updatedNumbers = new Set((updatedRows || []).map(r => r.order_number));
    const missed = cleanNumbers.filter(no => !updatedNumbers.has(no));

    return res.status(200).json({
      success: true,
      requested: cleanNumbers.length,
      updated: (updatedRows || []).length,
      missed,
      data: updatedRows || [],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unexpected error' });
  }
}
