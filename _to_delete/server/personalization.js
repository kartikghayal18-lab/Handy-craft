import crypto from 'node:crypto';
import { CheckoutError, requireServerEnv } from './razorpay.js';

// Personalization photos are uploaded only after a payment has already been verified and the
// order/order_items exist (see api/personalization/upload.js), so this never touches the
// payment flow itself — a failed or skipped photo upload never blocks or reverses an order.
export const ALLOWED_IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
// Vercel serverless functions cap the request body at ~4.5MB; base64 adds ~33% overhead, so the
// decoded per-file limit is kept well under that ceiling with room for the JSON envelope.
export const MAX_FILE_BYTES = 3 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 4 * MAX_FILE_BYTES;
export const MAX_FILES_PER_REQUEST = 6;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function supabaseServiceConfig() {
  const url = requireServerEnv('SUPABASE_URL', ['VITE_SUPABASE_URL']).replace(/\/$/, '');
  const key = requireServerEnv('SUPABASE_SERVICE_ROLE_KEY');
  return { url, key };
}

async function readJson(response, fallbackMessage) {
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) throw new CheckoutError(data?.message || fallbackMessage, response.status >= 500 ? 502 : response.status, 'UPSTREAM_ERROR');
  return data;
}

// Confirms the order exists and has actually been paid, and resolves the order_item that
// belongs to this order + product — so an uploaded photo can only ever attach to the real
// order_item it was submitted for, never a guessed or unrelated one.
export async function resolveOrderItem({ orderId, productId }) {
  if (!UUID_PATTERN.test(orderId || '') || !UUID_PATTERN.test(productId || '')) {
    throw new CheckoutError('Order and product must be valid.', 400, 'INVALID_REFERENCE');
  }
  const { url, key } = supabaseServiceConfig();
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  const orderEndpoint = new URL(`${url}/rest/v1/orders`);
  orderEndpoint.searchParams.set('select', 'id,payment_status');
  orderEndpoint.searchParams.set('id', `eq.${orderId}`);
  const orders = await readJson(await fetch(orderEndpoint, { headers }), 'Unable to look up this order.');
  const order = orders?.[0];
  if (!order) throw new CheckoutError('Order not found.', 404, 'ORDER_NOT_FOUND');
  if (order.payment_status !== 'paid') throw new CheckoutError('This order has not completed payment yet.', 409, 'ORDER_NOT_PAID');

  const itemEndpoint = new URL(`${url}/rest/v1/order_items`);
  itemEndpoint.searchParams.set('select', 'id');
  itemEndpoint.searchParams.set('order_id', `eq.${orderId}`);
  itemEndpoint.searchParams.set('product_id', `eq.${productId}`);
  const items = await readJson(await fetch(itemEndpoint, { headers }), 'Unable to look up this order item.');
  const item = items?.[0];
  if (!item) throw new CheckoutError('This product is not part of that order.', 404, 'ORDER_ITEM_NOT_FOUND');
  return item.id;
}

// Uploads the original file bytes untouched (no re-encoding/compression) to the existing
// private customer-personalization bucket, then attaches a personalization_assets row —
// the same table/bucket the rest of the app already reads from.
export async function storePersonalizationPhoto({ orderId, orderItemId, contentType, buffer, originalFilename }) {
  const extension = ALLOWED_IMAGE_TYPES[contentType];
  if (!extension) throw new CheckoutError('Photos must be JPG, PNG, or WEBP.', 400, 'INVALID_FILE_TYPE');
  if (!buffer.length || buffer.length > MAX_FILE_BYTES) {
    throw new CheckoutError(`Each photo must be under ${Math.round(MAX_FILE_BYTES / (1024 * 1024))}MB.`, 400, 'FILE_TOO_LARGE');
  }
  const { url, key } = supabaseServiceConfig();
  const storagePath = `${orderId}/${orderItemId}/${crypto.randomUUID()}.${extension}`;
  const uploadResponse = await fetch(`${url}/storage/v1/object/customer-personalization/${storagePath}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': contentType, 'x-upsert': 'false' },
    body: buffer,
  });
  if (!uploadResponse.ok) {
    await uploadResponse.text().catch(() => '');
    throw new CheckoutError('The photo could not be stored.', 502, 'STORAGE_UPLOAD_FAILED');
  }
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  const insertResponse = await fetch(`${url}/rest/v1/personalization_assets`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ order_id: orderId, order_item_id: orderItemId, storage_path: storagePath, original_filename: String(originalFilename || 'photo').slice(0, 255) }),
  });
  const rows = await readJson(insertResponse, 'The photo was uploaded but could not be attached to the order.');
  return rows?.[0];
}
