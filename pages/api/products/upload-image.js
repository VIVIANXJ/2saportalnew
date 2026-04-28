/**
 * /api/products/upload-image
 *
 * POST multipart/form-data:
 *   - file: image file
 *   - sku: product SKU (used as filename)
 *   - product_id: product UUID (to update image_url after upload)
 *
 * Uploads to Supabase Storage 'product-images' bucket,
 * then updates products.image_url with the public URL.
 */

import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '../auth/login';

export const config = {
  api: { bodyParser: false }, // required for file uploads
};

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Parse multipart form data without external dependencies
async function parseFormData(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] || '';
      const boundary = contentType.split('boundary=')[1];
      if (!boundary) return reject(new Error('No boundary found'));

      const parts = {};
      const boundaryBuf = Buffer.from('--' + boundary);
      let start = 0;

      // Find all parts
      while (start < body.length) {
        const boundaryIdx = body.indexOf(boundaryBuf, start);
        if (boundaryIdx === -1) break;
        const partStart = boundaryIdx + boundaryBuf.length + 2; // skip \r\n
        const nextBoundary = body.indexOf(boundaryBuf, partStart);
        if (nextBoundary === -1) break;
        const partEnd = nextBoundary - 2; // remove trailing \r\n

        const part = body.slice(partStart, partEnd);
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1) { start = nextBoundary; continue; }

        const headerStr = part.slice(0, headerEnd).toString();
        const data      = part.slice(headerEnd + 4);

        const nameMatch = headerStr.match(/name="([^"]+)"/);
        const fileMatch = headerStr.match(/filename="([^"]+)"/);
        const ctMatch   = headerStr.match(/Content-Type: (.+)/);

        if (nameMatch) {
          const name = nameMatch[1];
          if (fileMatch) {
            parts[name] = {
              filename:    fileMatch[1],
              contentType: ctMatch ? ctMatch[1].trim() : 'application/octet-stream',
              data,
            };
          } else {
            parts[name] = data.toString();
          }
        }
        start = nextBoundary;
      }
      resolve(parts);
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const user  = verifyToken(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = getSupabase();

  try {
    const parts = await parseFormData(req);

    const file       = parts.file;
    const sku        = parts.sku   || '';
    const productId  = parts.product_id || '';

    if (!file || !file.data) return res.status(400).json({ error: 'No file provided' });
    if (!sku)                return res.status(400).json({ error: 'SKU required' });

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.contentType)) {
      return res.status(400).json({ error: 'Only JPG, PNG, WebP, GIF allowed' });
    }

    // Validate file size (max 5MB)
    if (file.data.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'File too large (max 5MB)' });
    }

    // Build filename: use SKU as name, keep extension
    const ext      = file.filename.split('.').pop().toLowerCase() || 'jpg';
    const safeSku  = sku.replace(/[^a-zA-Z0-9-_]/g, '_');
    const filename = `${safeSku}.${ext}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(filename, file.data, {
        contentType:  file.contentType,
        upsert:       true, // overwrite if exists
      });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('product-images')
      .getPublicUrl(filename);

    // Update product image_url
    if (productId) {
      await supabase
        .from('products')
        .update({ image_url: publicUrl })
        .eq('id', productId);
    } else if (sku) {
      await supabase
        .from('products')
        .update({ image_url: publicUrl })
        .eq('sku', sku);
    }

    return res.status(200).json({
      success:   true,
      url:       publicUrl,
      filename,
      sku,
    });

  } catch (e) {
    console.error('[upload-image]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
