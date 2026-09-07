import {
  allowPost,
  assertPaymentPersistenceConfigured,
  createCheckoutToken,
  createRazorpayOrder,
  normalizeShipping,
  parseBody,
  priceTrustedCart,
  sendError,
} from '../../server/razorpay.js';

export default async function handler(req, res) {
  if (!allowPost(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = parseBody(req);
    const shipping = normalizeShipping(body.shipping);
    const cart = await priceTrustedCart(body.items);
    await assertPaymentPersistenceConfigured();
    const order = await createRazorpayOrder({ amount: cart.amount, currency: cart.currency });
    const checkoutToken = createCheckoutToken({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      items: cart.items,
      shipping,
    });
    res.status(200).json({
      success: true,
      orderId: order.id,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      checkout_token: checkoutToken,
    });
  } catch (error) {
    sendError(res, error);
  }
}
