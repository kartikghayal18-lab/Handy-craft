import { CheckoutError, allowPost, parseBody, sendError } from '../../server/razorpay.js';
import { getOrderForNotification, requireAdminFromToken } from '../../server/orders.js';
import { sendOrderStatusUpdateEmail } from '../../server/email.js';

// Called by the admin dashboard right after its existing, unchanged updateOrderStatus() call
// succeeds (src/admin/AdminApp.jsx). This endpoint never changes an order's status itself — it
// only re-verifies the caller is really an admin, re-fetches the order fresh from the database
// (never trusting client-supplied status/email), and sends the status-update email.
//
// Deliberately best-effort from the admin UI's point of view: if this call fails, the order's
// status has already been saved by the earlier call, so nothing about the admin workflow breaks.
export default async function handler(req, res) {
  if (!allowPost(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  try {
    await requireAdminFromToken(req.headers?.authorization);

    const body = parseBody(req);
    const orderId = String(body.order_id || '').trim();
    if (!orderId) throw new CheckoutError('Order id is required.', 400, 'ORDER_ID_REQUIRED');

    const order = await getOrderForNotification(orderId);
    if (!order) throw new CheckoutError('Order not found.', 404, 'ORDER_NOT_FOUND');

    const result = await sendOrderStatusUpdateEmail({
      to: order.customer?.email,
      customerName: order.customer?.name || order.shipping_name,
      orderNumber: order.order_number,
      status: order.order_status,
    });
    // sendOrderStatusUpdateEmail never throws — result.sent is false (with a reason) whenever
    // the provider isn't configured, there's no email on file, or the send failed; any of
    // those are logged inside server/email.js already and are not treated as request failures.
    res.status(200).json({ success: true, emailed: result.sent === true });
  } catch (error) {
    sendError(res, error);
  }
}
