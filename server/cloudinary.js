import crypto from 'node:crypto';
import { CheckoutError, requireServerEnv } from './razorpay.js';

// Cloudinary storage for customer personalization photos. Nothing in this codebase referenced
// Cloudinary before this file (grepped the whole repo for "cloudinary" — no matches, no env
// vars, no dependency), so this is new. It uses Cloudinary's plain REST upload API via fetch —
// no cloudinary npm SDK added — matching the hand-rolled fetch style already used for
// Razorpay/Supabase/Resend elsewhere in /server. CLOUDINARY_API_SECRET is read only here, on
// the server, and is used solely to sign upload requests; it never reaches the client.

let configDiagnosticLogged = false;

function cloudinaryConfig() {
  const cloudName = requireServerEnv('CLOUDINARY_CLOUD_NAME');
  const apiKey = requireServerEnv('CLOUDINARY_API_KEY');
  const apiSecret = requireServerEnv('CLOUDINARY_API_SECRET');
  // Safe, one-time-per-instance diagnostic for a "401 Invalid Signature" report: this never logs
  // apiSecret's value (only its length, since a stale/rotated/mis-pasted secret is the most
  // likely cause of a signature mismatch when the signing code itself is correct — a wrong
  // length is one concrete, checkable symptom of that without exposing anything). cloudName and
  // the shape of apiKey are not secrets — Cloudinary's own delivery URLs already contain
  // cloudName in plain text, and api_key is sent unencrypted in every upload request — so
  // logging them in full (cloudName) or trimmed (apiKey's last 4 digits, the way most dashboards
  // display key fingerprints) adds no exposure beyond what's already public in every request.
  if (!configDiagnosticLogged) {
    configDiagnosticLogged = true;
    console.log('[cloudinary] config loaded', {
      cloudName,
      apiKeyLast4: apiKey.slice(-4),
      apiSecretLength: apiSecret.length,
    });
  }
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
  // Every parameter that will be sent to Cloudinary below, OTHER than file/api_key/signature
  // (which the spec explicitly excludes from signing), must appear here — folder and timestamp
  // are the only two form fields set below besides those three, so this already matches exactly.
  // https://cloudinary.com/documentation/upload_images#generating_authentication_signatures
  const paramsToSign = { folder, timestamp };
  const signature = signParams(paramsToSign, apiSecret);

  console.log('[personalization-diagnostic] cloudinary upload started', { orderId, orderItemId, contentType, bytes: buffer.length, folder });

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
    // Cloudinary's own "Invalid Signature" error message echoes back the exact string it hashed
    // server-side (e.g. "...String to sign - 'folder=xxx&timestamp=169...'.") — that's safe to
    // log in full (it contains no secret; it's the same non-secret params sent above) and is the
    // single most useful piece of evidence for this failure mode: comparing it against
    // paramsToSign below proves whether our string-to-sign matches what Cloudinary expected, or
    // whether apiSecret itself (never logged) must be the mismatch.
    console.error('[cloudinary] upload failed:', response.status, data?.error?.message || '(no detail)', { orderId, orderItemId, paramsToSign });
    throw new CheckoutError('The photo could not be uploaded.', 502, 'CLOUDINARY_UPLOAD_FAILED');
  }
  console.log('[personalization-diagnostic] cloudinary upload succeeded', { orderId, orderItemId, publicId: data.public_id, hasSecureUrl: Boolean(data.secure_url) });
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
