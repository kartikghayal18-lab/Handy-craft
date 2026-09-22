import { getWhatsAppBusinessNumber } from '../../server/razorpay.js';

// Public, read-only, non-secret config endpoint. Exposes only the already-normalized,
// digits-only WHATSAPP_BUSINESS_NUMBER (read server-side from process.env — see
// getWhatsAppBusinessNumber() in server/razorpay.js, the single source of truth also used by
// /api/razorpay/verify-payment.js) so the homepage "How to Order" section can build its wa.me
// link without ever bundling the number into client code or hardcoding it anywhere. A WhatsApp
// business number is meant to be dialed/messaged by anyone, so serving it unauthenticated here
// is safe; nothing else is returned, and an unconfigured number comes back as ''.
export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }
  // Short public cache: this value changes only when someone edits the env var in Vercel
  // (which requires a redeploy anyway), so a brief cache avoids hitting this function on every
  // homepage load without ever risking a stale/wrong number for long.
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  res.status(200).json({ whatsappNumber: getWhatsAppBusinessNumber() });
}
