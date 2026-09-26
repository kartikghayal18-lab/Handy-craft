import { ALLOWED_IMAGE_TYPES, CheckoutError, MAX_FILE_BYTES, allowPost, parseBody, sendError } from '../../server/razorpay.js';
import { requireAdminFromToken } from '../../server/orders.js';
import { uploadPersonalizationPhoto } from '../../server/cloudinary.js';

// Admin-only: saves a customer's photo (received on WhatsApp) for a personalised order item to
// Cloudinary, using the existing, unchanged uploadPersonalizationPhoto() — same folder layout
// (forever-handy/personalization/<order>/<item>) and signing as before. The admin panel then
// records it as a personalization_assets row. Checkout and payment never call this.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (!allowPost(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  try {
    await requireAdminFromToken(req.headers?.authorization);
    const body = parseBody(req);
    const orderId = String(body.order_id || '');
    const orderItemId = String(body.order_item_id || '');
    if (!UUID.test(orderId) || !UUID.test(orderItemId)) throw new CheckoutError('Order and item must be valid.', 400, 'INVALID_REFERENCE');
    const contentType = String(body.content_type || '');
    if (!ALLOWED_IMAGE_TYPES[contentType]) throw new CheckoutError('Photos must be JPG, PNG or WEBP.', 400, 'INVALID_FILE_TYPE');
    const buffer = Buffer.from(String(body.data || ''), 'base64');
    if (!buffer.length || buffer.length > MAX_FILE_BYTES) {
      throw new CheckoutError(`Each photo must be under ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB.`, 400, 'FILE_TOO_LARGE');
    }
    const { publicId, secureUrl } = await uploadPersonalizationPhoto({ buffer, contentType, orderId, orderItemId });
    res.status(200).json({ url: secureUrl, public_id: publicId });
  } catch (error) {
    sendError(res, error);
  }
}
