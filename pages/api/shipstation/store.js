/**
 * /api/shipstation/stores
 * 列出 ShipStation 所有 Store，用于获取正确的 storeId
 * GET /api/shipstation/stores
 * GET /api/shipstation/stores?showInactive=true
 */
import { verifyToken } from '../auth/login';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth  = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!verifyToken(token)) return res.status(401).json({ error: 'Unauthorized' });

  const apiKey    = process.env.SHIPSTATION_API_KEY;
  const apiSecret = process.env.SHIPSTATION_API_SECRET;

  if (!apiKey || !apiSecret) {
    return res.status(500).json({
      error: 'SHIPSTATION_API_KEY or SHIPSTATION_API_SECRET not configured in Vercel environment variables',
      hint:  'Go to Vercel → Settings → Environment Variables and add both keys',
    });
  }

  try {
    const { showInactive, marketplaceId } = req.query;
    const params = new URLSearchParams();
    if (showInactive)   params.set('showInactive',   showInactive);
    if (marketplaceId)  params.set('marketplaceId',  marketplaceId);

    const url        = `https://ssapi.shipstation.com/stores${params.toString() ? '?' + params.toString() : ''}`;
    const authHeader = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;

    const ssRes = await fetch(url, {
      method:  'GET',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    });

    const text = await ssRes.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!ssRes.ok) {
      return res.status(ssRes.status).json({
        error: data?.Message || data?.message || `ShipStation HTTP ${ssRes.status}`,
        raw:   data,
      });
    }

    const stores = Array.isArray(data) ? data : [];
    return res.status(200).json({
      success: true,
      count:   stores.length,
      // 精简版，重要字段一目了然
      stores: stores.map(s => ({
        storeId:       s.storeId,
        storeName:     s.storeName,
        marketplaceId: s.marketplaceId,
        marketplaceName: s.marketplaceName,
        active:        s.active,
      })),
      raw: data,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
