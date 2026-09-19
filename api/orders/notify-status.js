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

// Best-effort duplicate-send guard, in-memory only (no new table/column, per the "keep it
// simple" instruction). Covers the realistic case this endpoint can actually see — a
// double-click or a retried request landing on the same warm serverless instance within a
// short window. It resets on cold start, and a second instance handling a retry wouldn't share
// it; the admin UI's own busy-disable on the status button is the primary guard, this is
// defense in depth, not a strict cross-instance lock.
const recentlyNotified = new Map(); // `${orderId}:${status}` -> last-sent timestamp (ms)
const DEDUPE_WINDOW_MS = 60_000;

function alreadyNotifiedRecently(orderId, status) {
  const key = `${orderId}:${status}`;
  const now = Date.now();
  const last = recentlyNotified.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) return true;
  recentlyNotified.set(key, now);
  if (recentlyNotified.size > 500) {
    for (const [k, t] of recentlyNotified) if (now - t > DEDUPE_WINDOW_MS) recentlyNotified.delete(k);
  }
  return false;
}

export default async function handler(req, res) {
  if (!allowPost(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  try {
    await requireAdminFromToken(req.headers?.authorization);

    const body = parseBody(req);
    const orderId = String(body.order_id || '').trim();
    if (!orderId) throw new CheckoutError('Order id is required.', 400, 'ORDER_ID_REQUIRED');
    const previousStatus = body.previous_status ? String(body.previous_status).trim() : null;

    const order = await getOrderForNotification(orderId);
    if (!order) throw new CheckoutError('Order not found.', 404, 'ORDER_NOT_FOUND');

    // Nothing to notify about if the status the client says it changed from is the same as the
    // order's current status — that means no real change happened (or it was already reverted).
    if (previousStatus && previousStatus === order.order_status) {
      res.status(200).json({ success: true, emailed: false, reason: 'STATUS_UNCHANGED' });
      return;
    }
    if (alreadyNotifiedRecently(order.id, order.order_status)) {
      res.status(200).json({ success: true, emailed: false, reason: 'DUPLICATE_SUPPRESSED' });
      return;
    }

    // order.email is the customer's real, checkout-validated email saved directly on the
    // order (see server/razorpay.js finalizeSupabaseOrder) — it is preferred over
    // customer.email, which can be a placeholder for orders whose customer record wasn't
    // linked to a real email by the underlying database function. customer.email is only a
    // fallback for orders placed before this column existed.
    const result = await sendOrderStatusUpdateEmail({
      to: order.email || order.customer?.email,
      customerName: order.customer?.name || order.shipping_name,
      orderNumber: order.order_number,
      status: order.order_status,
      total: order.total,
      items: order.order_items,
    });
    // sendOrderStatusUpdateEmail never throws — result.sent is false (with a reason) whenever
    // the provider isn't configured, there's no email on file, or the send failed. Any failure
    // is already logged inside server/email.js (console.error, so it's visible in Vercel's
    // function logs) and is never treated as a request failure here — the status update this
    // endpoint is reporting on has already been saved regardless of whether the email went out.
    if (!result.sent) console.error('[notify-status] email not sent for order', order.order_number, '-', result.reason);
    res.status(200).json({ success: true, emailed: result.sent === true, reason: result.sent ? undefined : result.reason });
  } catch (error) {
    sendError(res, error);
  }
}
