import { CheckoutError, requireServerEnv } from './razorpay.js';

// Used by the admin status-notification endpoint (api/orders/notify-status.js), which needs
// service-role access to `orders` — there is no anon/public RLS policy on that table (by
// design, since order rows contain the customer's address and phone), so this always goes
// through the service role key, never the anon key.
//
// Customer-facing order tracking (the /track-order page, api/orders/track.js, and the
// order-number/phone normalization + lookup that supported it) was removed at the customer's
// request. Admin order status management, the status-update email, and everything below are
// unaffected — this file no longer exports normalizePhone/normalizeOrderNumber/
// findOrderForTracking/ORDER_STATUS_STEPS because nothing uses them anymore.

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

// Fetches an order by its internal id with service role, for server-to-server use only
// (email sending).
export async function getOrderForNotification(orderId) {
  const { url, key } = supabaseServiceConfig();
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const endpoint = new URL(`${url}/rest/v1/orders`);
  endpoint.searchParams.set(
    'select',
    'id,order_number,order_status,payment_status,total,email,shipping_name,shipping_phone,shipping_address,shipping_city,shipping_state,shipping_postal_code,customer:customers(email,name),order_items(product_name_snapshot,quantity,price_snapshot)'
  );
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
