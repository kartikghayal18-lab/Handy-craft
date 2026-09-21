import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { uploadPersonalizationPhoto } from './cloudinary.js';

const MAX_ITEMS = 50;
const MAX_QUANTITY = 20;
const TOKEN_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let persistenceCheck;

function readLocalDevelopmentEnv(name) {
  for (const filename of ['.env.local', '.env']) {
    const envPath = path.resolve(process.cwd(), filename);
    if (!fs.existsSync(envPath)) continue;
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = fs.readFileSync(envPath, 'utf8').match(new RegExp(`^${escapedName}\\s*=\\s*([^\\r\\n]*)`, 'm'));
    const value = match?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2');
    if (value) return value;
  }

  return '';
}

// A Vercel env var pasted from a local .env file sometimes carries its surrounding quotes along
// (".env" syntax allows `KEY="value"`, but Vercel's dashboard stores exactly what's typed into
// the field, quotes and all — there is no .env-style parsing on that side). That produces a
// secret whose real bytes are `"actual-secret"` instead of `actual-secret`, which fails any
// signature check with no other symptom. readLocalDevelopmentEnv above already strips this for
// local .env files (line above); this applies the identical stripping to process.env, which is
// the only source that matters once deployed on Vercel. A value with no wrapping quotes is
// returned unchanged, so this is a no-op for every correctly-set variable.
function stripWrappingQuotes(value) {
  return value?.replace(/^(['"])(.*)\1$/, '$2');
}

export class CheckoutError extends Error {
  constructor(message, status = 400, code = 'CHECKOUT_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// A Supabase/PostgREST response of "permission denied for table X" (Postgres error code 42501)
// means OUR OWN service-role key is missing a database GRANT — it is never something the
// caller (a customer uploading a photo, or an admin changing a status) did wrong. Before this
// fix, every place that read a Supabase REST response forwarded PostgREST's status code
// verbatim, so a missing grant surfaced to the browser as a plain 403 — indistinguishable from
// "you are not allowed to do this," which is actively misleading for both a customer (who did
// nothing wrong) and whoever is debugging the report ("customer upload gets 403" reads like an
// auth bug, not a database configuration gap). This detects that specific case so callers can
// remap it to a 500 (our fault, not theirs) instead. Exported so server/orders.js's readJson
// uses the exact same check rather than a second copy of this logic.
export function isPostgresPermissionDenied(status, data) {
  return status === 403 && (data?.code === '42501' || /permission denied for table/i.test(data?.message || ''));
}

// WhatsApp business number for the post-payment "send photos" CTA (src/main.jsx). Read
// server-side from the deployment's actual env var name, WHATSAPP_BUSINESS_NUMBER (no VITE_
// prefix — it is intentionally NOT a client-bundled Vite var), normalized to digits-only (wa.me
// links require e.g. "+91 98765 43210" -> "919876543210"), and never thrown on if missing: the
// WhatsApp CTA is optional (the success screen falls back to the order-confirmation email when
// this is unset), so a missing/misconfigured number must never turn payment verification itself
// into an error. A WhatsApp number isn't a secret, but it still isn't logged in full — only its
// digit count and last 2 digits, enough to confirm against the dashboard without echoing it.
let whatsappNumberDiagnosticLogged = false;
export function getWhatsAppBusinessNumber() {
  const local = readLocalDevelopmentEnv('WHATSAPP_BUSINESS_NUMBER');
  const raw = local || process.env.WHATSAPP_BUSINESS_NUMBER?.trim() || '';
  if (!raw) return '';
  const digits = stripWrappingQuotes(raw.trim()).replace(/[^\d]/g, '');
  if (!whatsappNumberDiagnosticLogged) {
    whatsappNumberDiagnosticLogged = true;
    console.log('[whatsapp] WHATSAPP_BUSINESS_NUMBER read server-side', { digitCount: digits.length, last2: digits.slice(-2) });
  }
  return digits;
}

export function requireServerEnv(name, fallbacks = []) {
  for (const key of [name, ...fallbacks]) {
    const local = readLocalDevelopmentEnv(key);
    if (local) return local;
    const raw = process.env[key]?.trim();
    if (raw) {
      const value = stripWrappingQuotes(raw);
      // Safe, one-line, no-value diagnostic: proves (or rules out) the "pasted with quotes"
      // config mistake without ever logging the secret itself — only that stripping changed
      // something, and by how many characters.
      if (value !== raw) console.warn('[env] stripped accidental wrapping quotes from', key, `(${raw.length} -> ${value.length} chars)`);
      return value;
    }
  }
  throw new CheckoutError(`Server configuration is missing ${name}.`, 500, 'SERVER_CONFIGURATION_ERROR');
}

export function allowPost(req, res) {
  if (req.method === 'POST') return true;
  res.setHeader('Allow', 'POST');
  res.status(405).json({ error: 'Method not allowed.' });
  return false;
}

export function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body || '{}');
  } catch {
    throw new CheckoutError('Request body must be valid JSON.');
  }
}

export function normalizeItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_ITEMS) {
    throw new CheckoutError(`Cart must contain between 1 and ${MAX_ITEMS} items.`);
  }

  const normalized = new Map();
  for (const item of items) {
    const productId = String(item?.product_id || '').trim();
    const quantity = Number(item?.quantity);
    if (!UUID_PATTERN.test(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw new CheckoutError('Cart contains an invalid product or quantity.');
    }
    if (normalized.has(productId)) throw new CheckoutError('Cart contains a duplicate product.');
    normalized.set(productId, {
      product_id: productId,
      quantity,
      customization_text: item?.customization_text ? String(item.customization_text).trim().slice(0, 500) : null,
    });
  }
  return [...normalized.values()];
}

export function normalizeShipping(shipping) {
  const clean = key => String(shipping?.[key] || '').trim();
  const normalized = {
    name: clean('name'),
    phone: clean('phone'),
    email: clean('email'),
    address: clean('address'),
    city: clean('city'),
    state: clean('state'),
    postal_code: clean('postal_code'),
    country: 'India',
  };
  if (!normalized.name || !normalized.phone || !normalized.address || !normalized.city || !normalized.state) {
    throw new CheckoutError('Complete delivery details are required.');
  }
  if (!/^\d{6}$/.test(normalized.postal_code)) throw new CheckoutError('Enter a valid 6-digit postal code.');
  // Email is compulsory (order-confirmation and status-update notifications depend on it) —
  // validated the same way phone/address/etc. are, as a required field rather than optional.
  if (!normalized.email) throw new CheckoutError('Email address is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) {
    throw new CheckoutError('Enter a valid email address.');
  }
  return normalized;
}

function rupeesToPaise(value, context) {
  const paise = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(paise) || paise < 1) {
    // Safe diagnostic: which product and what raw price value failed to convert — never
    // anything from the customer's payment/shipping details. This, plus sendError() now
    // logging every CheckoutError (see below), is what makes a 409 here traceable in Vercel
    // logs instead of showing only "POST /api/razorpay/create-order -> 409" with no detail.
    console.error('[checkout] invalid product price', { productId: context?.productId, rawValue: value });
    throw new CheckoutError('A product has an invalid price.', 409, 'INVALID_PRODUCT_PRICE');
  }
  return paise;
}

function supabaseConfig({ serviceRole = false } = {}) {
  const url = requireServerEnv('SUPABASE_URL', ['VITE_SUPABASE_URL']).replace(/\/$/, '');
  const key = serviceRole
    ? requireServerEnv('SUPABASE_SERVICE_ROLE_KEY')
    : requireServerEnv('SUPABASE_ANON_KEY', ['VITE_SUPABASE_ANON_KEY']);
  return { url, key };
}

// Shared by both Razorpay's HTTP API (createRazorpayOrder, fetchRazorpayPayment — error shape
// {error:{description,reason,code}}) and service-role Supabase REST calls below (error shape
// {code,message}, e.g. Postgres 42501 "permission denied"). isPostgresPermissionDenied only
// matches that second, very specific Postgres error shape, so it can never misfire on a
// genuine Razorpay error.
async function readJson(response, fallbackMessage) {
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    if (isPostgresPermissionDenied(response.status, data)) {
      console.error('[service-role-permission-denied]', { detail: data?.message, fallbackMessage });
      throw new CheckoutError('This request could not be completed right now. Please try again shortly.', 500, 'SERVICE_ROLE_PERMISSION_DENIED');
    }
    const message = data?.error?.description || data?.error?.reason || data?.message || fallbackMessage;
    throw new CheckoutError(message, response.status >= 500 ? 502 : response.status, 'UPSTREAM_ERROR');
  }
  return data;
}

// The only place /api/razorpay/create-order can return 409 — every branch below re-validates
// the cart against the database (never trusting client-sent prices/availability), so a 409 here
// always means "the cart, as priced against the live database right now, isn't payable" rather
// than a bug in create-order itself. Each branch logs safe, specific context (product id/name,
// stock numbers, computed totals — never shipping/payment details or secrets) immediately before
// throwing, so a 409 in Vercel's logs is traceable to the exact product/condition instead of
// showing only the bare HTTP status.
export async function priceTrustedCart(items) {
  const normalizedItems = normalizeItems(items);
  const { url, key } = supabaseConfig({ serviceRole: true });
  const endpoint = new URL(`${url}/rest/v1/products`);
  endpoint.searchParams.set('select', 'id,name,price,sale_price,status,stock_quantity');
  endpoint.searchParams.set('id', `in.(${normalizedItems.map(item => item.product_id).join(',')})`);
  const response = await fetch(endpoint, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  const products = await readJson(response, 'Unable to validate products.');
  const productsById = new Map(products.map(product => [product.id, product]));
  let amount = 0;

  for (const item of normalizedItems) {
    const product = productsById.get(item.product_id);
    if (!product || product.status !== 'active') {
      console.error('[checkout] cart item unavailable', {
        productId: item.product_id,
        found: Boolean(product),
        status: product?.status ?? null,
      });
      throw new CheckoutError('A product is no longer available.', 409, 'PRODUCT_UNAVAILABLE');
    }
    if (!Number.isInteger(product.stock_quantity) || product.stock_quantity < item.quantity) {
      console.error('[checkout] insufficient stock', {
        productId: product.id,
        requestedQuantity: item.quantity,
        stockQuantity: product.stock_quantity,
      });
      throw new CheckoutError(`${product.name || 'A product'} does not have enough stock.`, 409, 'INSUFFICIENT_STOCK');
    }
    amount += rupeesToPaise(product.sale_price ?? product.price, { productId: product.id }) * item.quantity;
  }
  if (!Number.isSafeInteger(amount) || amount < 100) {
    console.error('[checkout] cart total invalid', { computedAmountPaise: amount, itemCount: normalizedItems.length });
    throw new CheckoutError('Cart total is invalid.', 409, 'CART_TOTAL_INVALID');
  }
  return { items: normalizedItems, amount, currency: 'INR' };
}

export async function assertPaymentPersistenceConfigured() {
  if (!persistenceCheck) {
    persistenceCheck = (async () => {
      const { url, key } = supabaseConfig({ serviceRole: true });
      const response = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      const schema = await readJson(response, 'Unable to inspect the paid-order database contract.');
      if (!schema?.paths?.['/rpc/finalize_razorpay_order']) {
        throw new CheckoutError('The paid-order database migration has not been applied.', 503, 'DATABASE_MIGRATION_REQUIRED');
      }
      return true;
    })().catch(error => {
      persistenceCheck = undefined;
      throw error;
    });
  }
  return persistenceCheck;
}

function razorpayAuth() {
  const keyId = requireServerEnv('RAZORPAY_KEY_ID');
  const keySecret = requireServerEnv('RAZORPAY_KEY_SECRET');
  if (!/^rzp_(test|live)_/.test(keyId)) {
    throw new CheckoutError('Razorpay key ID is invalid.', 500, 'RAZORPAY_CONFIGURATION_ERROR');
  }
  return { keyId, keySecret, authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}` };
}

export async function createRazorpayOrder({ amount, currency = 'INR' }) {
  const { authorization } = razorpayAuth();
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, currency, receipt: `mk_${Date.now()}_${crypto.randomBytes(4).toString('hex')}` }),
  });
  return readJson(response, 'Razorpay could not create the payment order.');
}

export async function fetchRazorpayPayment(paymentId) {
  const { authorization } = razorpayAuth();
  const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: authorization },
  });
  return readJson(response, 'Razorpay payment status could not be confirmed.');
}

function safeEqualHex(expected, received) {
  if (!/^[a-f0-9]{64}$/i.test(received || '')) return false;
  const expectedBuffer = Buffer.from(expected, 'hex');
  const receivedBuffer = Buffer.from(received, 'hex');
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function verifyPaymentSignature({ orderId, paymentId, signature }) {
  const secret = requireServerEnv('RAZORPAY_KEY_SECRET');
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqualHex(expected, signature);
}

export function createCheckoutToken(payload) {
  const encoded = Buffer.from(JSON.stringify({ ...payload, issuedAt: Date.now() })).toString('base64url');
  const signature = crypto.createHmac('sha256', requireServerEnv('RAZORPAY_KEY_SECRET')).update(encoded).digest('hex');
  return `${encoded}.${signature}`;
}

export function verifyCheckoutToken(token) {
  const [encoded, signature, extra] = String(token || '').split('.');
  if (!encoded || !signature || extra) throw new CheckoutError('Checkout session is invalid or expired.');
  const expected = crypto.createHmac('sha256', requireServerEnv('RAZORPAY_KEY_SECRET')).update(encoded).digest('hex');
  if (!safeEqualHex(expected, signature)) throw new CheckoutError('Checkout session is invalid or expired.');
  let payload;
  try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch { throw new CheckoutError('Checkout session is invalid or expired.'); }
  if (!payload.issuedAt || Date.now() - payload.issuedAt > TOKEN_MAX_AGE_MS) throw new CheckoutError('Checkout session is invalid or expired.');
  return payload;
}

export async function finalizeSupabaseOrder({ shipping, items, razorpayOrderId, razorpayPaymentId, paidAmount }) {
  const { url, key } = supabaseConfig({ serviceRole: true });
  const response = await fetch(`${url}/rest/v1/rpc/finalize_razorpay_order`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_shipping: shipping,
      p_items: items,
      p_razorpay_order_id: razorpayOrderId,
      p_razorpay_payment_id: razorpayPaymentId,
      p_paid_amount_paise: paidAmount,
    }),
  });
  if (response.status === 404 || response.status === 400) {
    const text = await response.text();
    if (/finalize_razorpay_order|schema cache|pgrst202/i.test(text)) {
      throw new CheckoutError('The paid-order database migration has not been applied.', 503, 'DATABASE_MIGRATION_REQUIRED');
    }
    let data;
    try { data = JSON.parse(text); } catch { data = null; }
    throw new CheckoutError(data?.message || 'The verified order could not be stored.', 500, 'ORDER_STORAGE_ERROR');
  }
  const order = await readJson(response, 'The verified order could not be stored.');

  // finalize_razorpay_order is a Supabase RPC created directly in the database (it is not in
  // this repo's migrations), so its own customer-linking logic is opaque from here — it may
  // resolve a customer's email from something other than the checkout form (an auth email, a
  // guest placeholder, etc). To guarantee the order this call just created always has the
  // customer's REAL, validated checkout email available for status/notification emails later,
  // it is written directly onto orders.email right here, straight from validated input — never
  // a Razorpay-side or placeholder address. Best-effort: any failure here is logged but never
  // fails checkout, since the order itself was already successfully created above.
  if (order?.id && shipping?.email) {
    try {
      const patchResponse = await fetch(`${url}/rest/v1/orders?id=eq.${order.id}`, {
        method: 'PATCH',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ email: shipping.email }),
      });
      if (!patchResponse.ok) {
        const text = await patchResponse.text().catch(() => '');
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = null; }
        // This PATCH is a raw fetch (not routed through readJson), so it never got the
        // isPostgresPermissionDenied reclassification applied elsewhere in this file — checked
        // directly here instead, purely to make the log line unambiguous about whether this is
        // the same missing-service-role-grant condition (fixed by the
        // 202609190001_service_role_order_personalization_grants.sql migration, which grants
        // UPDATE on orders) or a genuinely different failure. This PATCH remains best-effort:
        // its failure is only ever logged, never thrown, so it cannot fail checkout itself —
        // order creation above already succeeded regardless of what happens here.
        console.error('[razorpay] could not save customer email on order', order.id, {
          status: patchResponse.status,
          likelyMissingServiceRoleGrant: isPostgresPermissionDenied(patchResponse.status, data),
          detail: text.slice(0, 300),
        });
      } else {
        order.email = shipping.email;
      }
    } catch (error) {
      console.error('[razorpay] could not save customer email on order', order.id, error?.message || error);
    }
  }
  return order;
}

export function sendError(res, error) {
  const status = error instanceof CheckoutError ? error.status : 500;
  const code = error instanceof CheckoutError ? error.code : 'INTERNAL_ERROR';
  // Previously only non-CheckoutErrors were logged here, on the theory that a CheckoutError is
  // an "expected" validation failure with its own safe, descriptive message. In practice that
  // meant EVERY 409/403/etc from the checkout flow was completely invisible server-side —
  // Vercel's own access log shows "POST /api/razorpay/create-order -> 409" and nothing else, so
  // there was no way to tell which of several possible causes fired without this line. The
  // message on a CheckoutError is already written to be safe to show the customer, so logging it
  // here (plus the status/code) adds no new exposure — it's the same text the response body
  // already contains, just also visible in server logs.
  console.error('[razorpay]', { status, code, message: error?.message, ...(error instanceof CheckoutError ? {} : { stack: error?.stack }) });
  res.status(status).json({ error: status >= 500 ? 'Secure checkout is temporarily unavailable.' : error.message, code });
}

// ---------------------------------------------------------------------------------------
// Personalization photo uploads (api/personalization/upload.js).
// Called only after Razorpay payment verification has already succeeded and a real
// order + order_items exist, so this never participates in payment/order creation — a
// failed or skipped upload here never blocks or reverses an order.
// ---------------------------------------------------------------------------------------

const UUID_PATTERN_LOOSE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ALLOWED_IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
// Vercel serverless functions cap the request body at ~4.5MB; base64 adds ~33% overhead, so the
// decoded per-file limit is kept well under that ceiling with room for the JSON envelope.
export const MAX_FILE_BYTES = 3 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 4 * MAX_FILE_BYTES;
export const MAX_FILES_PER_REQUEST = 6;

async function readJsonRows(response, fallbackMessage) {
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    if (isPostgresPermissionDenied(response.status, data)) {
      // Logged in full server-side (message only — never headers/keys) so this is diagnosable
      // from Vercel logs; the client only ever sees a generic 500, never "permission denied".
      console.error('[service-role-permission-denied]', { detail: data?.message, fallbackMessage });
      throw new CheckoutError('This request could not be completed right now. Please try again shortly.', 500, 'SERVICE_ROLE_PERMISSION_DENIED');
    }
    throw new CheckoutError(data?.message || fallbackMessage, response.status >= 500 ? 502 : response.status, 'UPSTREAM_ERROR');
  }
  return data;
}

// Confirms the order exists and has actually been paid, and resolves the order_item that
// belongs to this order + product — so an uploaded photo can only ever attach to the real
// order_item it was submitted for, never a guessed or unrelated one.
export async function resolveOrderItem({ orderId, productId }) {
  if (!UUID_PATTERN_LOOSE.test(orderId || '') || !UUID_PATTERN_LOOSE.test(productId || '')) {
    throw new CheckoutError('Order and product must be valid.', 400, 'INVALID_REFERENCE');
  }
  const { url, key } = supabaseConfig({ serviceRole: true });
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  const orderEndpoint = new URL(`${url}/rest/v1/orders`);
  orderEndpoint.searchParams.set('select', 'id,payment_status');
  orderEndpoint.searchParams.set('id', `eq.${orderId}`);
  const orders = await readJsonRows(await fetch(orderEndpoint, { headers }), 'Unable to look up this order.');
  const order = orders?.[0];
  if (!order) throw new CheckoutError('Order not found.', 404, 'ORDER_NOT_FOUND');
  if (order.payment_status !== 'paid') throw new CheckoutError('This order has not completed payment yet.', 409, 'ORDER_NOT_PAID');

  const itemEndpoint = new URL(`${url}/rest/v1/order_items`);
  itemEndpoint.searchParams.set('select', 'id');
  itemEndpoint.searchParams.set('order_id', `eq.${orderId}`);
  itemEndpoint.searchParams.set('product_id', `eq.${productId}`);
  const items = await readJsonRows(await fetch(itemEndpoint, { headers }), 'Unable to look up this order item.');
  const item = items?.[0];
  if (!item) throw new CheckoutError('This product is not part of that order.', 404, 'ORDER_ITEM_NOT_FOUND');
  // TEMPORARY diagnostic (server-side only, no secrets): confirms this order/product pair
  // actually resolved to a real order_item before any Cloudinary upload or DB insert is
  // attempted — if this line never appears in the logs for a given order, the upload request
  // never reached this function (or failed the order/payment lookup above it).
  console.log('[personalization-diagnostic] resolveOrderItem', { orderId, productId, orderItemId: item.id });
  return item.id;
}

// Uploads the original file bytes untouched to Cloudinary (no re-encoding/compression/resize),
// then attaches a personalization_assets row.
//
// ROOT CAUSE (confirmed against the live table's actual columns, which are only: id, order_id,
// order_item_id, storage_path, public_url, original_filename, created_at): this insert used to
// also send cloudinary_public_id/original_url/bytes/format. Those columns were added by
// supabase/migrations/202609181300_personalization_cloudinary_and_order_email.sql, but that
// migration was never actually run on the live database — so PostgREST rejected every insert
// with "column personalization_assets.cloudinary_public_id does not exist", the insert failed
// BEFORE a row was ever written, and Admin > Orders correctly (if confusingly) showed "No photo
// uploaded" — there was never a row to show. Cloudinary's own upload above still succeeded,
// which is why this looked like a display bug rather than a failed insert.
//
// Fix: only write the columns that actually exist on the table. storage_path (NOT NULL) holds
// the Cloudinary public id; public_url holds Cloudinary's permanent secure_url — this is what
// the admin UI now renders directly (see PersonalizationPhotoLink in src/admin/AdminApp.jsx).
export async function storePersonalizationPhoto({ orderId, orderItemId, contentType, buffer, originalFilename }) {
  const extension = ALLOWED_IMAGE_TYPES[contentType];
  if (!extension) throw new CheckoutError('Photos must be JPG, PNG, or WEBP.', 400, 'INVALID_FILE_TYPE');
  if (!buffer.length || buffer.length > MAX_FILE_BYTES) {
    throw new CheckoutError(`Each photo must be under ${Math.round(MAX_FILE_BYTES / (1024 * 1024))}MB.`, 400, 'FILE_TOO_LARGE');
  }
  let uploadResult;
  try {
    uploadResult = await uploadPersonalizationPhoto({ buffer, contentType, orderId, orderItemId });
  } catch (error) {
    // TEMPORARY diagnostic: Cloudinary itself already logs the HTTP status/error detail in
    // server/cloudinary.js — this line ties that failure back to the specific order/item so it
    // shows up when grepping logs for one test order, without duplicating the secret-bearing
    // request itself.
    console.log('[personalization-diagnostic] cloudinary upload failed', { orderId, orderItemId, error: error?.message || String(error) });
    throw error;
  }
  const { publicId, secureUrl } = uploadResult;
  console.log('[personalization-diagnostic] cloudinary upload result', {
    orderId, orderItemId, cloudinaryUploadStatus: 'success', hasSecureUrl: Boolean(secureUrl), hasPublicId: Boolean(publicId),
  });

  const { url, key } = supabaseConfig({ serviceRole: true });
  const insertResponse = await fetch(`${url}/rest/v1/personalization_assets`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      order_id: orderId,
      order_item_id: orderItemId,
      storage_path: publicId,
      public_url: secureUrl,
      original_filename: String(originalFilename || 'photo').slice(0, 255),
    }),
  });
  let rows;
  try {
    rows = await readJsonRows(insertResponse, 'The photo was uploaded but could not be attached to the order.');
  } catch (error) {
    // TEMPORARY diagnostic: if the Cloudinary upload above succeeded but this insert fails
    // (e.g. a missing service_role grant on personalization_assets, or an unapplied migration
    // that added/renamed a column), this is the line that proves the photo made it to
    // Cloudinary but never became a database row — the exact failure mode this bug report
    // describes.
    console.log('[personalization-diagnostic] personalization_assets insert failed', { orderId, orderItemId, error: error?.message || String(error) });
    throw error;
  }
  const inserted = rows?.[0];
  console.log('[personalization-diagnostic] personalization_assets insert result', {
    orderId, orderItemId, insertedRowId: inserted?.id || null, hasPublicUrl: Boolean(inserted?.public_url),
  });
  return inserted;
}
