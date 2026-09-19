import { CheckoutError, sendError } from '../../server/razorpay.js';
import { diagnosePersonalizationForOrder, requireAdminFromToken } from '../../server/orders.js';

// TEMPORARY, admin-only diagnostic endpoint for the personalization-photo bug report.
// GET /api/admin/personalization-diagnostic?order_id=<uuid>
// Requires an admin Supabase session (Authorization: Bearer <access_token>), same as
// api/orders/notify-status.js. Reads the live database with the service role — bypassing
// whatever the admin dashboard's own client-side query does — so it tells us definitively
// whether personalization_assets rows exist for this order, independent of anything the
// admin UI might be getting wrong. Never returns or logs secrets. Safe to delete once the
// personalization photo flow is confirmed working end-to-end in production.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  try {
    await requireAdminFromToken(req.headers?.authorization);
    const orderId = String(req.query?.order_id || '').trim();
    if (!orderId) throw new CheckoutError('order_id is required.', 400, 'ORDER_ID_REQUIRED');
    const result = await diagnosePersonalizationForOrder(orderId);
    res.status(200).json(result);
  } catch (error) {
    sendError(res, error);
  }
}
