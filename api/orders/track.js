import { CheckoutError, sendError } from '../../server/razorpay.js';
import { findOrderForTracking } from '../../server/orders.js';

// Public, unauthenticated tracking endpoint — GET /api/orders/track?orderId=...&phone=...
// No customer login exists by design, so this is the only way a customer can check an order's
// status. Both orderId (the customer-facing order_number, e.g. MK-XXXXXXXXXX) and the phone
// number used at checkout must match the same order — never look up by orderId alone.
//
// On any failure (order not found, or found but phone doesn't match) this returns the exact
// same generic response, so neither this endpoint nor the UI on top of it can be used to learn
// whether an order number exists or which field was wrong.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  try {
    const orderId = String(req.query?.orderId || '').trim();
    const phone = String(req.query?.phone || '').trim();
    if (!orderId || !phone) {
      throw new CheckoutError('Order not found. Please check your details.', 404, 'ORDER_NOT_FOUND');
    }

    let order;
    try {
      order = await findOrderForTracking({ orderNumber: orderId, phone });
    } catch (lookupError) {
      // findOrderForTracking's upstream Supabase call can fail with ANY status — a permission
      // error (missing grants) comes back as 403/400, not 500, so this must never rely on
      // status alone to decide what's safe to show the customer. Every upstream failure, no
      // matter its status or message, becomes the exact same generic response; the real detail
      // (e.g. "permission denied for table orders") only ever goes to the server log below,
      // never to the client.
      console.error('[track-order] upstream lookup failed:', lookupError?.message || lookupError);
      throw new CheckoutError('Order not found. Please check your details.', 404, 'ORDER_NOT_FOUND');
    }
    if (!order) {
      throw new CheckoutError('Order not found. Please check your details.', 404, 'ORDER_NOT_FOUND');
    }

    // Only what the tracking page needs — no internal id, no admin-only fields, no
    // personalization photo URLs.
    res.status(200).json({
      order: {
        order_number: order.order_number,
        created_at: order.created_at,
        order_status: order.order_status,
        payment_status: order.payment_status,
        total: order.total,
        customer_name: order.shipping_name,
        delivery_address: {
          address: order.shipping_address,
          city: order.shipping_city,
          state: order.shipping_state,
          postal_code: order.shipping_postal_code,
        },
        items: (order.order_items || []).map(item => ({
          product_name: item.product_name_snapshot,
          quantity: item.quantity,
          price: item.price_snapshot,
        })),
      },
    });
  } catch (error) {
    // Every path above that can fail — missing input, no match, or an upstream lookup error —
    // throws the same generic ORDER_NOT_FOUND CheckoutError, so this always sends the identical
    // customer-facing response regardless of which case it was.
    sendError(res, error);
  }
}
