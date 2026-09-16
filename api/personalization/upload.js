import { CheckoutError, MAX_FILES_PER_REQUEST, MAX_TOTAL_BYTES, allowPost, parseBody, resolveOrderItem, sendError, storePersonalizationPhoto } from '../../server/razorpay.js';

// Called by the storefront only after Razorpay payment verification has already succeeded and
// a real order + order_items exist. It never participates in payment/order creation, so a
// failed or skipped call here cannot break or roll back a checkout.
export default async function handler(req, res) {
  if (!allowPost(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = parseBody(req);
    const orderId = String(body.order_id || '').trim();
    const productId = String(body.product_id || '').trim();
    const files = Array.isArray(body.files) ? body.files : [];
    if (!files.length) throw new CheckoutError('No photos were provided.', 400, 'NO_FILES');
    if (files.length > MAX_FILES_PER_REQUEST) {
      throw new CheckoutError(`Only up to ${MAX_FILES_PER_REQUEST} photos can be uploaded per product.`, 400, 'TOO_MANY_FILES');
    }

    const buffers = files.map(file => {
      const base64 = String(file?.dataBase64 || '').split(',').pop();
      const buffer = Buffer.from(base64 || '', 'base64');
      return { buffer, contentType: String(file?.contentType || '').trim(), originalFilename: file?.filename };
    });
    const totalBytes = buffers.reduce((sum, file) => sum + file.buffer.length, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new CheckoutError(`These photos are too large to upload together (max ${Math.round(MAX_TOTAL_BYTES / (1024 * 1024))}MB total).`, 400, 'PAYLOAD_TOO_LARGE');
    }

    const orderItemId = await resolveOrderItem({ orderId, productId });
    const uploaded = [];
    for (const file of buffers) {
      uploaded.push(await storePersonalizationPhoto({ orderId, orderItemId, contentType: file.contentType, buffer: file.buffer, originalFilename: file.originalFilename }));
    }
    res.status(200).json({ success: true, uploaded: uploaded.length });
  } catch (error) {
    sendError(res, error);
  }
}
