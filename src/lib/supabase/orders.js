import { requireSupabase } from './client';
import { requireAdmin } from './auth';

export async function createOrder({ shipping, items, discount = 0, shippingFee = 0 }) { const { data, error } = await requireSupabase().rpc('create_order', { p_shipping: shipping, p_items: items, p_discount: discount, p_shipping_fee: shippingFee }); if (error) throw error; return data; }
export async function getOrders() { await requireAdmin(); const { data, error } = await requireSupabase().from('orders').select('*, customer:customers(*), order_items(*)').order('created_at', { ascending: false }); if (error) throw error; return data; }
// Same as getOrders(), but also embeds each order_item's uploaded personalization photos
// (storage_path/public_url/original_filename). Kept separate from getOrders() so the
// Orders list and Overview stats — which don't need the photo rows — stay unchanged.
export async function getPersonalizationOrders() { await requireAdmin(); const { data, error } = await requireSupabase().from('orders').select('*, customer:customers(*), order_items(*, personalization_assets(*))').order('created_at', { ascending: false }); if (error) throw error; return data; }
export async function getOrder(id) { await requireAdmin(); const { data, error } = await requireSupabase().from('orders').select('*, customer:customers(*), order_items(*), personalization_assets(*), order_notes(*)').eq('id', id).single(); if (error) throw error; return data; }
export async function updateOrderStatus(id, order_status) { await requireAdmin(); const { data, error } = await requireSupabase().from('orders').update({ order_status }).eq('id', id).select().single(); if (error) throw error; return data; }
export async function addOrderNote(order_id, note) { const user = await requireAdmin(); const { data, error } = await requireSupabase().from('order_notes').insert({ order_id, note, admin_user_id: user.id }).select().single(); if (error) throw error; return data; }
export async function updateShipping(id, shipping) { await requireAdmin(); const { data, error } = await requireSupabase().from('orders').update(shipping).eq('id', id).select().single(); if (error) throw error; return data; }

// Best-effort status-update email, called after updateOrderStatus() has already succeeded — a
// failure here (network hiccup, email not configured, etc.) is only logged to the console and
// never surfaces to the admin, since the status change itself has already been saved.
export async function notifyOrderStatusUpdate(orderId, previousStatus) {
  try {
    const { data } = await requireSupabase().auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return;
    const response = await fetch('/api/orders/notify-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ order_id: orderId, previous_status: previousStatus }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      console.warn('Order status email could not be sent:', body?.error || response.status);
    }
  } catch (error) {
    console.warn('Order status email could not be sent:', error);
  }
}
