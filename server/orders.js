import { CheckoutError, requireServerEnv } from './razorpay.js';

// Shared by the public tracking endpoint (api/orders/track.js) and the admin
// status-notification endpoint (api/orders/notify-status.js). Both need service-role
// access to `orders` — there is no anon/public RLS policy on that table (by design,
// since order rows contain the customer's address and phone), so this always goes
// through the service role key, never the anon key.

export const ORDER_STATUS_STEPS = ['pending', 'confirmed', 'preparing', 'ready', 'shipped', 'delivered'];

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

// India-first normalization: keep digits only, then compare the last 10 — this tolerates
// +91, a leading 0, spaces, and dashes without needing the checkout form (which only
// requires non-empty, no strict format) to be stricter than it already is.
export function normalizePhone(raw) {
  return String(raw || '').replace(/\D/g, '').slice(-10);
}

// Looks the order up by order_number alone (cheap, unique), then compares the normalized
// phone in application code and returns null on any mismatch — order_number and phone are
// deliberately never distinguished in the caller-facing result, so neither field's
// correctness leaks to whoever is asking.
export async function findOrderForTracking({ orderNumber, phone }) {
  const cleanOrderNumber = String(orderNumber || '').trim().toUpperCase();
  const cleanPhone = normalizePhone(phone);
  if (!cleanOrderNumber || cleanPhone.length !== 10) return null;

  const { url, key } = supabaseServiceConfig();
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const endpoint = new URL(`${url}/rest/v1/orders`);
  endpoint.searchParams.set(
    'select',
    'order_number,created_at,order_status,payment_status,total,shipping_name,shipping_phone,shipping_address,shipping_city,shipping_state,shipping_postal_code,order_items(product_name_snapshot,quantity,price_snapshot)'
  );
  endpoint.searchParams.set('order_number', `eq.${cleanOrderNumber}`);
  const rows = await readJson(await fetch(endpoint, { headers }), 'Unable to look up this order.');
  const order = rows?.[0];
  if (!order || normalizePhone(order.shipping_phone) !== cleanPhone) return null;
  const { shipping_phone, ...safeOrder } = order;
  void shipping_phone; // never echoed back — the customer already knows their own number
  return safeOrder;
}

// Fetches an order by its internal id with service role, for server-to-server use only
// (email sending) — never exposed to the public tracking endpoint, which looks up by
// order_number + phone instead.
export async function getOrderForNotification(orderId) {
  const { url, key } = supabaseServiceConfig();
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const endpoint = new URL(`${url}/rest/v1/orders`);
  endpoint.searchParams.set('select', 'id,order_number,order_status,payment_status,total,shipping_name,tracking_number,tracking_url,customer:customers(email,name),order_items(product_name_snapshot,quantity,price_snapshot)');
  endpoint.searchParams.set('id', `eq.${orderId}`);
  const rows = await readJson(await fetch(endpoint, { headers }), 'Unable to look up this order.');
  return rows?.[0] || null;
}

// Verifies a Supabase access token belongs to a signed-in admin, mirroring the same
// profiles.role === 'admin' check src/lib/supabase/auth.js's requireAdmin() already does
// client-side — re-checked server-side here because this endpoint can send email, so it
// must not trust the caller merely being logged into the admin dashboard's UI.
export async function requireAdminFromToken(authorizationHeader) {
  const token = String(authorizationHeader || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new CheckoutError('Admin sign-in required.', 401, 'ADMIN_AUTH_REQUIRED');
  const anonUrl = requireServerEnv('SUPABASE_URL', ['VITE_SUPABASE_URL']).replace(/\/$/, '');
  const anonKey = requireServerEnv('SUPABASE_ANON_KEY', ['VITE_SUPABASE_ANON_KEY']);
  const userResponse = await fetch(`${anonUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } });
  if (!userResponse.ok) throw new CheckoutError('Admin sign-in required.', 401, 'ADMIN_AUTH_REQUIRED');
  const user = await userResponse.json();
  const { url, key } = supabaseServiceConfig();
  const profileEndpoint = new URL(`${url}/rest/v1/profiles`);
  profileEndpoint.searchParams.set('select', 'role');
  profileEndpoint.searchParams.set('id', `eq.${user.id}`);
  const rows = await readJson(await fetch(profileEndpoint, { headers: { apikey: key, Authorization: `Bearer ${key}` } }), 'Unable to verify admin access.');
  if (rows?.[0]?.role !== 'admin') throw new CheckoutError('Admin access required.', 403, 'ADMIN_ACCESS_REQUIRED');
  return user;
}
