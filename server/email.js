import { requireServerEnv } from './razorpay.js';

// Order-update emails (confirmation + status change). No SMS, per product decision — email only.
// No email provider existed in this codebase before this file (grepped for RESEND/SENDGRID/etc,
// found nothing), so this uses Resend's plain REST API via fetch, matching the same hand-rolled
// fetch-based integration style already used for Razorpay and Supabase elsewhere in /server —
// no new npm dependency added.
//
// Email sending is always best-effort: every export here catches its own errors and returns a
// {sent:false, reason} result instead of throwing, so a missing provider or a transient failure
// can never block or roll back order creation or an admin status update. Failures are still
// logged (console.error) rather than swallowed silently, so they're visible in Vercel's function
// logs even though they don't surface to the customer or admin UI.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function readOptionalEnv(name) {
  const value = process.env[name]?.trim();
  return value || '';
}

export function isEmailConfigured() {
  return Boolean(readOptionalEnv('RESEND_API_KEY') && readOptionalEnv('RESEND_FROM_EMAIL'));
}

// RESEND_FROM_EMAIL can be set either as a bare address ("orders@foreverhandy.store") or
// already formatted with a display name ("Forever Handy <orders@foreverhandy.store>"). Either
// way this always sends as "Forever Handy <...>", per the sender identity requested.
function fromHeader() {
  const value = readOptionalEnv('RESEND_FROM_EMAIL');
  if (!value) return value;
  return value.includes('<') ? value : `Forever Handy <${value}>`;
}

// Resolves the production site URL for tracking links. Prefers an explicit SITE_URL env var;
// falls back to Vercel's own auto-populated VERCEL_URL (which has no protocol, so https:// is
// prefixed); never falls back to localhost, so a misconfigured production deploy fails loud
// (missing link text) rather than silently emailing an unusable localhost link.
export function getSiteUrl() {
  const explicit = readOptionalEnv('SITE_URL');
  if (explicit) return explicit.replace(/\/$/, '');
  const vercelUrl = readOptionalEnv('VERCEL_URL');
  if (vercelUrl) return `https://${vercelUrl}`;
  return '';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function trackOrderUrl() {
  const siteUrl = getSiteUrl();
  return siteUrl ? `${siteUrl}/track-order` : '/track-order';
}

// Renders the items/total block shared by both emails — the "order summary" the status-update
// email is required to include. Skipped entirely when no items are available (never renders an
// empty table).
function orderSummaryBlock({ items, total }) {
  if (!Array.isArray(items) || !items.length) return '';
  const rows = items.map(item => `<tr>
      <td style="padding:6px 0;color:#222;font-size:14px;">${escapeHtml(item.product_name_snapshot)} × ${escapeHtml(item.quantity)}</td>
      <td style="padding:6px 0;color:#222;font-size:14px;text-align:right;">₹${escapeHtml(Number(item.price_snapshot * item.quantity).toLocaleString('en-IN'))}</td>
    </tr>`).join('');
  const totalRow = total != null
    ? `<tr><td style="padding:10px 0 0;font-size:14px;font-weight:bold;border-top:1px solid #eee;">Total</td><td style="padding:10px 0 0;font-size:14px;font-weight:bold;text-align:right;border-top:1px solid #eee;">₹${escapeHtml(Number(total).toLocaleString('en-IN'))}</td></tr>`
    : '';
  return `<table style="width:100%;border-collapse:collapse;margin:8px 0 0;">${rows}${totalRow}</table>`;
}

function baseLayout({ heading, bodyLines, summaryHtml, ctaLabel, ctaUrl, trackingNumber }) {
  const ctaBlock = ctaUrl
    ? `<p style="margin:28px 0 0;"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;">${escapeHtml(ctaLabel)}</a></p>`
    : '';
  const trackingBlock = trackingNumber
    ? `<p style="margin:12px 0 0;color:#222;font-size:14px;">Tracking number: <strong>${escapeHtml(trackingNumber)}</strong></p>`
    : '';
  const paragraphs = bodyLines.map(line => `<p style="margin:0 0 12px;color:#222;font-size:15px;line-height:1.5;">${line}</p>`).join('');
  return `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#f7f5f2;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:10px;padding:28px 24px;">
      <p style="margin:0 0 20px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#8a7f6f;">Forever Handy</p>
      <h1 style="margin:0 0 16px;font-size:20px;color:#111;">${escapeHtml(heading)}</h1>
      ${paragraphs}
      ${summaryHtml || ''}
      ${trackingBlock}
      ${ctaBlock}
      <p style="margin:28px 0 0;color:#8a7f6f;font-size:13px;">Thank you,<br/>Forever Handy</p>
    </div>
  </body></html>`;
}

async function sendEmail({ to, subject, html }) {
  if (!isEmailConfigured()) {
    console.warn('[email] skipped — RESEND_API_KEY/RESEND_FROM_EMAIL not configured:', subject);
    return { sent: false, reason: 'NOT_CONFIGURED' };
  }
  if (!to) {
    console.warn('[email] skipped — no recipient email on this order:', subject);
    return { sent: false, reason: 'NO_RECIPIENT' };
  }
  try {
    const apiKey = requireServerEnv('RESEND_API_KEY');
    const from = fromHeader();
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('[email] Resend request failed:', response.status, detail.slice(0, 500));
      return { sent: false, reason: 'PROVIDER_ERROR' };
    }
    return { sent: true };
  } catch (error) {
    console.error('[email] send failed:', error?.message || error);
    return { sent: false, reason: 'SEND_ERROR' };
  }
}

const STATUS_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

// Sent once, right after a payment is verified and the order is actually created — never before.
export async function sendOrderConfirmationEmail({ to, customerName, orderNumber }) {
  const html = baseLayout({
    heading: `Order #${orderNumber} confirmed`,
    bodyLines: [
      `Hi ${escapeHtml(customerName || 'there')},`,
      `Thank you for your order. We've received your order <strong>#${escapeHtml(orderNumber)}</strong> and it's now being processed.`,
      `You can track its status any time using the link below.`,
    ],
    ctaLabel: 'Track Your Order',
    ctaUrl: trackOrderUrl(),
  });
  return sendEmail({ to, subject: `Your Forever Handy order #${orderNumber} is confirmed`, html });
}

// Sent when an admin changes an order's status from the existing Orders page — layered after
// the existing status-update call, never in place of it. Includes the order summary (items +
// total) and tracking info when available, per the required email content.
export async function sendOrderStatusUpdateEmail({ to, customerName, orderNumber, status, total, items, trackingNumber, trackingUrl }) {
  const label = statusLabel(status);
  const html = baseLayout({
    heading: `Order #${orderNumber} is now ${label}`,
    bodyLines: [
      `Hi ${escapeHtml(customerName || 'there')},`,
      `Your order <strong>#${escapeHtml(orderNumber)}</strong> has been updated.`,
      `Current status: <strong>${escapeHtml(label)}</strong>`,
    ],
    summaryHtml: orderSummaryBlock({ items, total }),
    trackingNumber,
    ctaLabel: 'Track Your Order',
    ctaUrl: trackingUrl || trackOrderUrl(),
  });
  return sendEmail({ to, subject: `Your Forever Handy order #${orderNumber} is now ${label}`, html });
}
