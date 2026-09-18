import crypto from 'node:crypto';
import { CheckoutError, requireServerEnv } from './razorpay.js';

// Cloudinary storage for customer personalization photos. Nothing in this codebase referenced
// Cloudinary before this file (grepped the whole repo for "cloudinary" — no matches, no env
// vars, no dependency), so this is new. It uses Cloudinary's plain REST upload API via fetch —
// no cloudinary npm SDK added — matching the hand-rolled fetch style already used for
// Razorpay/Supabase/Resend elsewhere in /server. CLOUDINARY_API_SECRET is read only here, on
// the server, and is used solely to sign upload requests; it never reaches the client.

function cloudinaryConfig() {
  const cloudName = requireServerEnv('CLOUDINARY_CLOUD_NAME');
  const apiKey = requireServerEnv('CLOUDINARY_API_KEY');
  const apiSecret = requireServerEnv('CLOUDINARY_API_SECRET');
  return { cloudName, apiKey, apiSecret };
}

export function isCloudinaryConfigured() {
  try { cloudinaryConfig(); return true; } catch { return false; }
}

// Cloudinary's signing algorithm: every param that will be sent (except file/api_key/signature
// itself) is sorted by key, joined as key=value pairs with '&', the api_secret is appended, and
// the whole string is SHA-1 hashed. https://cloudinary.com/documentation/upload_images#generating_authentication_signatures
function signParams(params, apiSecret) {
  const toSign = Object.keys(params)
    .filter(key => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');
  return crypto.createHash('sha1').update(toSign + apiSecret).digest('hex');
}

// Uploads the ORIGINAL file bytes untouched — no eager transformation, no quality or format
// change, no resizing — to Cloudinary, under a folder scoped to the exact order + order item so
// photos for different orders can never collide or be confused with each other. Returns the
// permanent identifiers the personalization_assets row needs to keep this photo retrievable
// forever, independent of any browser session or temporary URL.
export async function uploadPersonalizationPhoto({ buffer, contentType, orderId, orderItemId }) {
  const { cloudName, apiKey, apiSecret } = cloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `forever-handy/personalization/${orderId}/${orderItemId}`;
  const signature = signParams({ folder, timestamp }, apiSecret);

  const form = new FormData();
  form.set('file', `data:${contentType};base64,${buffer.toString('base64')}`);
  form.set('api_key', apiKey);
  form.set('timestamp', String(timestamp));
  form.set('signature', signature);
  form.set('folder', folder);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: form,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.secure_url) {
    console.error('[cloudinary] upload failed:', response.status, data?.error?.message || '(no detail)');
    throw new CheckoutError('The photo could not be uploaded.', 502, 'CLOUDINARY_UPLOAD_FAILED');
  }
  return { publicId: data.public_id, secureUrl: data.secure_url, bytes: data.bytes, format: data.format };
}

// A forced-download URL for the ORIGINAL asset. Cloudinary's fl_attachment flag only changes
// the response's Content-Disposition header (so the browser downloads instead of navigating) —
// it applies no resize, recompression, or quality change, so this is still the exact original
// file. Never used for the on-page thumbnail (that's previewUrl, below).
export function downloadUrl(secureUrl) {
  if (!secureUrl || !secureUrl.includes('/upload/')) return secureUrl;
  return secureUrl.replace('/upload/', '/upload/fl_attachment/');
}

// A separate, size-limited derivative for admin thumbnails only. This never touches or
// replaces the stored original — secureUrl (and downloadUrl(secureUrl)) always still points at
// the untouched original file.
export function previewUrl(secureUrl, width = 480) {
  if (!secureUrl || !secureUrl.includes('/upload/')) return secureUrl;
  return secureUrl.replace('/upload/', `/upload/w_${width},c_limit,q_auto/`);
}
