import { CheckoutError, allowPost, fetchRazorpayPayment, finalizeSupabaseOrder, parseBody, sendError, verifyCheckoutToken, verifyPaymentSignature } from '../../server/razorpay.js';
import { sendOrderConfirmationEmail } from '../../server/email.js';
import { getOrderForNotification } from '../../server/orders.js';

// Best-effort duplicate-confirmation-email guard, in-memory only (mirrors the same pattern in
// api/orders/notify-status.js) — covers a client retrying verify-payment after a network hiccup
// hid a first, already-successful response, landing on the same warm serverless instance.
const recentlyConfirmed = new Map(); // razorpayPaymentId -> timestamp (ms)
const CONFIRM_DEDUPE_WINDOW_MS = 5 * 60_000;

function alreadyConfirmedRecently(paymentId) {
  const now = Date.now();
  const last = recentlyConfirmed.get(paymentId);
  if (last && now - last < CONFIRM_DEDUPE_WINDOW_MS) return true;
  recentlyConfirmed.set(paymentId, now);
  if (recentlyConfirmed.size > 500) {
    for (const [k, t] of recentlyConfirmed) if (now - t > CONFIRM_DEDUPE_WINDOW_MS) recentlyConfirmed.delete(k);
  }
  return false;
}

export default async function handler(req, res) {
  if (!allowPost(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = parseBody(req);
    const orderId = String(body.razorpay_order_id || '').trim();
    const paymentId = String(body.razorpay_payment_id || '').trim();
    const signature = String(body.razorpay_signature || '').trim();
    if (!orderId || !paymentId || !signature) throw new CheckoutError('Payment verification details are incomplete.');
    const checkout = verifyCheckoutToken(body.checkout_token);
    if (checkout.orderId !== orderId) throw new CheckoutError('Payment order does not match this checkout.', 400, 'ORDER_MISMATCH');
    if (!verifyPaymentSignature({ orderId: checkout.orderId, paymentId, signature })) {
      throw new CheckoutError('Payment signature is invalid.', 400, 'INVALID_SIGNATURE');
    }
    const payment = await fetchRazorpayPayment(paymentId);
    if (payment.order_id !== orderId || payment.amount !== checkout.amount || payment.currency !== checkout.currency) {
      throw new CheckoutError('Payment details do not match this checkout.', 400, 'PAYMENT_MISMATCH');
    }
    if (payment.status !== 'captured') {
      throw new CheckoutError('Payment has not been captured.', 409, 'PAYMENT_NOT_CAPTURED');
    }

    const order = await finalizeSupabaseOrder({
      shipping: checkout.shipping,
      items: checkout.items,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      paidAmount: payment.amount,
    });
    // Sent only after the order has actually been created above, and only once per payment —
    // alreadyConfirmedRecently() stops a client retry (e.g. the browser re-running verify after
    // a dropped response) from sending a second confirmation email for the same payment. This
    // is awaited (rather than truly fire-and-forget) because a Vercel serverless function can
    // be frozen/torn down right after the response is sent, which would silently drop an
    // unawaited send — but sendOrderConfirmationEmail itself never throws, so a failed or
    // skipped email can never turn a successful payment into an error response.
    if (order?.id && !alreadyConfirmedRecently(paymentId)) {
      // Re-fetches the order with its items/address so the confirmation email can show the
      // full order summary — the RPC's own return value only has to be trusted for order id/
      // order_number, not the full checkout contents.
      const enriched = await getOrderForNotification(order.id).catch(() => null);
      const deliveryAddress = enriched
        ? [enriched.shipping_address, enriched.shipping_city, enriched.shipping_state, enriched.shipping_postal_code].filter(Boolean).join(', ')
        : [checkout.shipping?.address, checkout.shipping?.city, checkout.shipping?.state, checkout.shipping?.postal_code].filter(Boolean).join(', ');
      await sendOrderConfirmationEmail({
        to: checkout.shipping?.email,
        customerName: checkout.shipping?.name,
        orderNumber: order?.order_number,
        items: enriched?.order_items,
        total: enriched?.total ?? order?.total,
        deliveryAddress,
        status: enriched?.order_status || 'confirmed',
      });
    }

    res.status(200).json({ verified: true, order });
  } catch (error) {
    sendError(res, error);
  }
}
