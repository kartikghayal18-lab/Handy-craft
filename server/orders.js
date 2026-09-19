import { CheckoutError, isPostgresPermissionDenied, requireServerEnv } from './razorpay.js';

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
  if (!response.ok) {
    // See isPostgresPermissionDenied's comment in server/razorpay.js: without this, a missing
    // service_role grant on `profiles` made requireAdminFromToken() return a plain 403 for
    // EVERY admin action on this endpoint (api/orders/notify-status.js), regardless of whether
    // the signed-in admin genuinely had the admin role — indistinguishable from a real
    // "you're not an admin" rejection. This remaps it to a 500 so that distinction is visible
    // again, without weakening the real admin-role check below it in any way.
    if (isPostgresPermissionDenied(response.status, data)) {
      console.error('[service-role-permission-denied]', { detail: data?.message, fallbackMessage });
      throw new CheckoutError('This request could not be completed right now. Please try again shortly.', 500, 'SERVICE_ROLE_PERMISSION_DENIED');
    }
    throw new CheckoutError(data?.message || fallbackMessage, response.status >= 500 ? 502 : response.status, 'UPSTREAM_ERROR');
  }
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

// TEMPORARY diagnostic (admin-only, see api/admin/personalization-diagnostic.js). Fetches one
// order's order_items and, for each, every personalization_assets row — with service role, so
// this reads the real database state regardless of what the admin dashboard's own RLS-bound
// query happens to return, which is the point: it tells us whether the problem is "no row was
// ever inserted" vs. "a row exists but the admin UI isn't showing it". Logs order id, each
// order_item id, how many personalization_assets rows were found for it, and whether each row's
// public_url is populated — never the row's actual URL/filename/secrets. Safe to delete once
// the personalization photo flow is confirmed working end-to-end.
export async function diagnosePersonalizationForOrder(orderId) {
  const { url, key } = supabaseServiceConfig();
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  const orderEndpoint = new URL(`${url}/rest/v1/orders`);
  orderEndpoint.searchParams.set('select', 'id,order_number,payment_status,order_status');
  orderEndpoint.searchParams.set('id', `eq.${orderId}`);
  const orders = await readJson(await fetch(orderEndpoint, { headers }), 'Unable to look up this order.');
  const order = orders?.[0];
  if (!order) {
    console.log('[personalization-diagnostic]', { orderId, found: false });
    return { found: false, orderId };
  }

  const itemsEndpoint = new URL(`${url}/rest/v1/order_items`);
  itemsEndpoint.searchParams.set('select', 'id,product_id,product_name_snapshot');
  itemsEndpoint.searchParams.set('order_id', `eq.${orderId}`);
  const items = await readJson(await fetch(itemsEndpoint, { headers }), 'Unable to look up order items.') || [];

  const assetsEndpoint = new URL(`${url}/rest/v1/personalization_assets`);
  assetsEndpoint.searchParams.set('select', 'id,order_item_id,public_url,storage_path,original_filename');
  assetsEndpoint.searchParams.set('order_id', `eq.${orderId}`);
  const assets = await readJson(await fetch(assetsEndpoint, { headers }), 'Unable to look up personalization assets.') || [];

  const perItem = items.map(item => {
    const rows = assets.filter(a => a.order_item_id === item.id);
    return {
      orderItemId: item.id,
      productId: item.product_id,
      productName: item.product_name_snapshot,
      personalizationAssetsFound: rows.length,
      allHavePublicUrl: rows.length > 0 && rows.every(r => Boolean(r.public_url)),
      rowsMissingPublicUrl: rows.filter(r => !r.public_url).length,
      hasOriginalFilename: rows.every(r => Boolean(r.original_filename)),
    };
  });

  console.log('[personalization-diagnostic]', {
    orderId, orderNumber: order.order_number, paymentStatus: order.payment_status, orderStatus: order.order_status,
    orderItemCount: items.length, totalPersonalizationAssetsForOrder: assets.length,
    perItem,
  });

  return { found: true, order, perItem };
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
