import { CheckoutError, allowPost, fetchRazorpayPayment, finalizeSupabaseOrder, parseBody, sendError, verifyCheckoutToken, verifyPaymentSignature } from '../../server/razorpay.js';

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
    res.status(200).json({ verified: true, order });
  } catch (error) {
    sendError(res, error);
  }
}
