/**
 * Forever Handy admin — the lists and rules the admin follows
 * (order statuses, payments, customisation, WhatsApp messages, settings and content defaults).
 * Plain data and pure functions, used by the Supabase data layer (supabase-api.js).
 */

export const ORDER_STATUSES = [
  ['order_placed', 'Order Placed'],
  ['payment_confirmed', 'Payment Confirmed'],
  ['customization_pending', 'Customization Pending'],
  ['customization_received', 'Customization Received'],
  ['in_production', 'In Production'],
  ['ready_to_ship', 'Ready to Ship'],
  ['shipped', 'Shipped'],
  ['delivered', 'Delivered'],
  ['cancelled', 'Cancelled'],
];
export const WORKFLOW = ORDER_STATUSES.map(([k]) => k).filter((k) => k !== 'cancelled');
export const PAYMENT_STATUSES = [['pending', 'Pending'], ['confirmed', 'Payment Confirmed'], ['failed', 'Payment Failed'], ['refunded', 'Refunded']];
export const PAYMENT_METHODS = ['upi', 'bank_transfer', 'cash', 'other'];
export const METHOD_LABELS = { upi: 'UPI', bank_transfer: 'Bank transfer', cash: 'Cash', other: 'Other' };
export const CUSTOM_STATUSES = [
  ['waiting_for_customer', 'Waiting for Customer'],
  ['photos_pending', 'Photos Pending'],
  ['photos_received', 'Photos Received'],
  ['requirements_received', 'Requirements Received'],
  ['design_pending', 'Design Pending'],
  ['design_approved', 'Approved'],
  ['in_production', 'In Production'],
  ['completed', 'Completed'],
];
export const PHOTO_STATUSES = ['not_required', 'pending', 'received'];
export const APPROVAL_STATUSES = ['pending', 'approved', 'changes_requested'];
export const PREPARING = ['payment_confirmed', 'customization_pending', 'customization_received', 'in_production', 'ready_to_ship'];
export const statusLabel = (k) => (ORDER_STATUSES.find(([x]) => x === k) || [k, k])[1];

const lines = (...l) => l.join('\n');
export const SETTING_DEFAULTS = {
  store_name: 'Forever Handy', tagline: 'Handmade, personalized gifts', logo_url: '',
  email: '', phone: '', whatsapp_number: '', address: '', gstin: '',
  instagram: '', facebook: '', pinterest: '', youtube: '',
  order_prefix: 'FH-', low_stock_threshold: '3', production_time: '5–7 working days', max_quantity: '10', allow_backorders: '0',
  shipping_flat: '0', free_shipping_above: '0', delivery_time: '', ship_regions: 'All India', cod: '0',
  notify_new_order: '1', notify_low_stock: '1', notify_reviews: '1', notify_daily_summary: '0', notify_email: '',
  appearance_density: 'comfortable', appearance_sidebar_art: '1', appearance_reduce_motion: '0',
  whatsapp_template: lines('Hi {{STORE_NAME}}, I have placed an order.', '', 'Order ID: {{ORDER_ID}}', 'Name: {{FULL_NAME}}', 'Phone: {{PHONE}}',
    'Product: {{PRODUCT_NAME}}', 'Quantity: {{QUANTITY}}', 'Total: ₹{{TOTAL}}', '', '{{CUSTOMIZATION}}', '', 'I would like to confirm my order and payment.'),
  whatsapp_custom_template: lines('Hi {{CUSTOMER_NAME}} 🌸', '', 'Thank you for your order {{ORDER_ID}} with {{STORE_NAME}}!', '',
    'To start your {{PRODUCT}}, please share:', '• 1–3 clear photos', '• Any names, dates or colours you’d like', '',
    'We’ll send you a design preview to approve before we begin.'),
  whatsapp_confirm_template: lines('Hi {{CUSTOMER_NAME}},', '', 'Your payment for order {{ORDER_ID}} is confirmed ✅', 'Total: ₹{{TOTAL}}', '',
    'We’ll start handcrafting it now and keep you updated here.', '', 'With love,', '{{STORE_NAME}}'),
};

// Mirrors the copy the shop shows today, so the admin opens on what customers actually see.
export const CONTENT_DEFAULTS = {
  hero: {
    eyebrow: 'Handmade · Personalized · Made with love', line1: 'Turn your', line2: 'moments into', script: 'forever gifts.',
    lede: 'Handcrafted and personalized gifts that keep your special moments close, always.',
    primary_cta: 'Create a gift', secondary_cta: 'Explore collection', image_url: '/images/studio-scene.webp',
  },
  categories_section: { eyebrow: 'Our collection', title: 'Shop by', title_accent: 'Category', lede: 'Discover handmade and personalized gifts created to make every moment special.' },
  featured_section: { title: 'Loved by our customers', lede: 'Our most-loved handmade gifts.', limit: 6 },
  process: {
    eyebrow: 'Our process', title: 'How it’s', title_accent: 'made', lede: 'From your memories to a gift made by hand.',
    steps: [
      { title: 'Share your idea', text: 'Send us your photos, names, dates or a few words about the moment you want to keep.' },
      { title: 'We design & confirm', text: 'We plan every detail and share a preview with you before we begin.' },
      { title: 'Handmade with love', text: 'Your gift is made by hand in our studio.' },
      { title: 'Delivered to you', text: 'Carefully packed and sent to your door, anywhere in India.' },
    ],
  },
  how_to_order: {
    eyebrow: 'Simple & personal', title: 'How to', title_accent: 'Order',
    lede: 'Three easy steps from our studio to your special moment.',
    steps: [
      { title: 'Add to cart', text: 'Browse our handmade gifts and add the pieces you love to your cart.' },
      { title: 'Buy & pay', text: 'Check out and complete your payment securely to place your order.' },
      { title: 'Customize on WhatsApp', text: 'We redirect you to WhatsApp. Share your photos, names, dates or anything you want us to personalize.' },
    ],
    cta_title: 'Ready to create something', cta_accent: 'special?', cta_label: 'Shop now',
  },
  about: { title: 'Our Story', body: '', image_url: '' },
  faq: { items: [] },
  contact: { tagline: 'Handmade, personalized gifts that keep your special moments close, always.', hours: '', email: '', phone: '', address: '' },
};

/* ---------- WhatsApp messages ---------- */
const PHOTO_NOTE = 'Photo/details to be shared on WhatsApp';
/**
 * Placeholders: {{STORE_NAME}} {{ORDER_ID}} {{CUSTOMER_NAME}} (first name) {{FULL_NAME}} {{PHONE}}
 * {{PRODUCT_NAME}} {{QUANTITY}} {{TOTAL}} {{ITEMS}} {{PRODUCT}} and {{CUSTOMIZATION}}.
 */
export function fillTemplate(tpl, order, settings) {
  const items = order.items || [];
  const variant = (it) => (it.variant_name ? ` (${it.variant_name.replace(/^[^:]+:\s*/, '')})` : '');
  const list = items.map((it) => `Product:\n${it.product_name}${variant(it)}\nQuantity:\n${it.quantity}`).join('\n\n');
  const single = items.length === 1;
  const custom = items.filter((it) => it.customization);
  const needs = custom.map((it) => {
    const req = it.customization.split('; ').filter((x) => x !== PHOTO_NOTE).join('; ');
    return req ? (single ? req : `${it.product_name}: ${req}`) : '';
  }).filter(Boolean);
  const customBlock = custom.length
    ? [needs.length ? `Customization: ${needs.join('\n')}` : '', 'I will send my customization photos/details here.'].filter(Boolean).join('\n')
    : '';
  return String(tpl || '')
    .replaceAll('{{STORE_NAME}}', settings.store_name || 'Forever Handy')
    .replaceAll('{{ORDER_ID}}', order.number)
    .replaceAll('{{ITEMS}}', list)
    .replaceAll('{{TOTAL}}', Number(order.total).toLocaleString('en-IN'))
    .replaceAll('{{CUSTOMIZATION}}', customBlock)
    .replaceAll('{{FULL_NAME}}', String(order.customer_name || ''))
    .replaceAll('{{PHONE}}', String(order.phone || ''))
    .replaceAll('{{CUSTOMER_NAME}}', String(order.customer_name || '').split(' ')[0])
    .replaceAll('{{PRODUCT_NAME}}', single ? `${items[0].product_name}${variant(items[0])}` : items.map((it) => `${it.product_name}${variant(it)} × ${it.quantity}`).join(', ') || 'piece')
    .replaceAll('{{QUANTITY}}', String(items.reduce((n, it) => n + Number(it.quantity || 0), 0)))
    .replaceAll('{{PRODUCT}}', items[0]?.product_name || 'piece')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** WhatsApp number for wa.me: digits only, with India's 91 added to a bare 10-digit number. '' if unusable. */
const waNumber = (raw) => {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  return d.length >= 11 && d.length <= 15 ? d : '';
};
/** Opens a chat with the customer, message prefilled. '#' when their phone number isn't usable. */
export function customerChatLink(o, settings, text) {
  const first = String(o.customer_name || '').split(' ')[0];
  const store = settings.store_name || 'Forever Handy';
  const n = waNumber(o.phone);
  if (!n) return '#';
  const msg = text ?? (o.number ? `Hi ${first}, this is ${store} about your order ${o.number}.` : `Hi ${first}, this is ${store}.`);
  return `https://wa.me/${n}?text=${encodeURIComponent(msg)}`;
}
