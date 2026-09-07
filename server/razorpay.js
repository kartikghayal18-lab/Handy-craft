import crypto from 'node:crypto';

const MAX_ITEMS = 50;
const MAX_QUANTITY = 20;
const TOKEN_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let persistenceCheck;

export class CheckoutError extends Error {
  constructor(message, status = 400, code = 'CHECKOUT_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function requireServerEnv(name, fallbacks = []) {
  for (const key of [name, ...fallbacks]) {
    const value = process.env[key]?.trim();
    if (value) return value;
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
  if (normalized.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) {
    throw new CheckoutError('Enter a valid email address.');
  }
  return normalized;
}

function rupeesToPaise(value) {
  const paise = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(paise) || paise < 1) throw new CheckoutError('A product has an invalid price.', 409);
  return paise;
}

function supabaseConfig({ serviceRole = false } = {}) {
  const url = requireServerEnv('SUPABASE_URL', ['VITE_SUPABASE_URL']).replace(/\/$/, '');
  const key = serviceRole
    ? requireServerEnv('SUPABASE_SERVICE_ROLE_KEY')
    : requireServerEnv('SUPABASE_ANON_KEY', ['VITE_SUPABASE_ANON_KEY']);
  return { url, key };
}

async function readJson(response, fallbackMessage) {
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    const message = data?.error?.description || data?.error?.reason || data?.message || fallbackMessage;
    throw new CheckoutError(message, response.status >= 500 ? 502 : response.status, 'UPSTREAM_ERROR');
  }
  return data;
}

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
    if (!product || product.status !== 'active') throw new CheckoutError('A product is no longer available.', 409);
    if (!Number.isInteger(product.stock_quantity) || product.stock_quantity < item.quantity) {
      throw new CheckoutError(`${product.name || 'A product'} does not have enough stock.`, 409);
    }
    amount += rupeesToPaise(product.sale_price ?? product.price) * item.quantity;
  }
  if (!Number.isSafeInteger(amount) || amount < 100) throw new CheckoutError('Cart total is invalid.', 409);
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
  if (!keyId.startsWith('rzp_test_')) {
    throw new CheckoutError('Razorpay must use a test-mode key for this integration.', 500, 'RAZORPAY_TEST_MODE_REQUIRED');
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
  return readJson(response, 'The verified order could not be stored.');
}

export function sendError(res, error) {
  const status = error instanceof CheckoutError ? error.status : 500;
  const code = error instanceof CheckoutError ? error.code : 'INTERNAL_ERROR';
  if (!(error instanceof CheckoutError)) console.error('[razorpay]', error);
  res.status(status).json({ error: status >= 500 ? 'Secure checkout is temporarily unavailable.' : error.message, code });
}
