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

    const order = await findOrderForTracking({ orderNumber: orderId, phone });
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
    // Any unexpected/upstream error is also shown as the same generic not-found message to
    // the customer (sendError already keeps 5xx bodies generic); only server logs (inside
    // findOrderForTracking's upstream calls) carry the real detail.
    if (error instanceof CheckoutError && error.status >= 500) {
      res.status(404).json({ error: 'Order not found. Please check your details.', code: 'ORDER_NOT_FOUND' });
      return;
    }
    sendError(res, error);
  }
}
