/**
 * Forever Handy admin — the admin API, answered from Supabase.
 *
 * The admin pages ask for `/products`, `/orders/:id`, … (the same paths and response shapes the
 * UI was designed against). This module answers them with the signed-in admin's Supabase session,
 * so every read and write is still checked by the database's row-level security (is_admin()).
 *
 * It translates between the admin's vocabulary and this store's tables:
 *   - order status:   order_placed ⇄ pending, payment_confirmed ⇄ confirmed, in_production ⇄ preparing,
 *                     ready_to_ship ⇄ ready (customization_pending/received, shipped, delivered, cancelled as-is)
 *   - payment status: confirmed ⇄ paid (Razorpay marks orders paid; nothing here changes checkout)
 *   - price:          price + compare-at ⇄ sale_price + price
 *   - product photos: Supabase Storage bucket `product-images` + product_images rows (unchanged)
 *   - customer photos for personalised items: Cloudinary, through /api/admin/upload-photo
 */
import { supabase } from '../../../src/lib/supabase/client.js';
import {
  ORDER_STATUSES, WORKFLOW, PAYMENT_STATUSES, PAYMENT_METHODS, METHOD_LABELS, CUSTOM_STATUSES, PHOTO_STATUSES, APPROVAL_STATUSES,
  PREPARING, SETTING_DEFAULTS, CONTENT_DEFAULTS, fillTemplate, customerChatLink, statusLabel,
} from './rules.js';

export class AdminDataError extends Error { constructor(status, message) { super(message); this.status = status; } }
const bad = (m) => new AdminDataError(400, m);
const notFound = (m = 'Not found.') => new AdminDataError(404, m);
const IMAGE_BUCKET = 'product-images';

/* ======================================================================
   Supabase helpers
   ====================================================================== */
const sb = () => {
  if (!supabase) throw new AdminDataError(500, 'Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
  return supabase;
};
/** Unwraps { data, error } into data, with messages an admin can act on. */
async function q(request, what = 'This change') {
  const { data, error } = await request;
  if (!error) return data;
  console.error('[admin] supabase', error);
  if (error.code === '23505') throw bad(/slug/i.test(error.message) ? 'That slug is already used. Choose another.' : /sku/i.test(error.message) ? 'That SKU is already used by another product.' : 'That value is already in use.');
  if (error.code === '23514') throw bad('Some values aren’t valid (for example a price of 0, or a sale price above the price).');
  if (error.code === '42501' || /row-level security|permission denied/i.test(error.message)) throw new AdminDataError(403, 'Your account isn’t allowed to do that. Make sure you are signed in as an admin.');
  if (error.code === 'P0001') throw bad(error.message);   // raised by a database rule (e.g. category nesting)
  if (/column .* does not exist|relation .* does not exist|schema cache/i.test(error.message)) {
    throw new AdminDataError(500, 'The database needs the admin migration (supabase/migrations/202609270001_v2_admin.sql). Run it in the Supabase SQL editor.');
  }
  throw new AdminDataError(500, `${what} couldn’t be completed. Please try again.`);
}

let adminCache = null;
/** The signed-in admin, or a 401/403. Re-checked against profiles.role on every page load. */
export async function currentAdmin() {
  const { data: { session } } = await sb().auth.getSession();
  if (!session) throw new AdminDataError(401, 'Please sign in again.');
  const user = session.user;
  if (!adminCache || adminCache.id !== user.id) {
    const profile = await q(sb().from('profiles').select('role').eq('id', user.id).maybeSingle(), 'Checking your account');
    if (profile?.role !== 'admin') throw new AdminDataError(403, 'This account is not an admin.');
    adminCache = { id: user.id };
  }
  return { id: user.id, email: user.email, name: user.user_metadata?.full_name || user.user_metadata?.name || 'Forever Handy', token: session.access_token };
}

const storageUrl = (path) => sb().storage.from(IMAGE_BUCKET).getPublicUrl(String(path).replace(/^\/+/, '')).data.publicUrl;
const imageUrl = (v) => (!v ? '' : /^(https?:|data:|\/)/i.test(v) ? v : storageUrl(v));
const ts = (s) => (s ? new Date(s).toISOString().slice(0, 19).replace('T', ' ') : null);   // the pages expect UTC "YYYY-MM-DD HH:MM:SS"
const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const money = (n) => Number(n || 0);

/* ======================================================================
   Vocabulary: this store's values ⇄ the admin's
   ====================================================================== */
const ORDER_TO_ADMIN = { pending: 'order_placed', confirmed: 'payment_confirmed', customization_pending: 'customization_pending', customization_received: 'customization_received',
  preparing: 'in_production', ready: 'ready_to_ship', shipped: 'shipped', delivered: 'delivered', cancelled: 'cancelled', refunded: 'cancelled' };
const ORDER_TO_DB = { order_placed: 'pending', payment_confirmed: 'confirmed', customization_pending: 'customization_pending', customization_received: 'customization_received',
  in_production: 'preparing', ready_to_ship: 'ready', shipped: 'shipped', delivered: 'delivered', cancelled: 'cancelled' };
const PAY_TO_ADMIN = { paid: 'confirmed', pending: 'pending', failed: 'failed', refunded: 'refunded' };
const PAY_TO_DB = { confirmed: 'paid', pending: 'pending', failed: 'failed', refunded: 'refunded' };
const REVIEW_TO_ADMIN = { pending: 'pending', approved: 'approved', rejected: 'hidden' };
const REVIEW_TO_DB = { pending: 'pending', approved: 'approved', hidden: 'rejected' };

/* ======================================================================
   Settings & content (store_settings / site_content)
   ====================================================================== */
let envWhatsApp = null;
async function whatsappFromServer() {
  if (envWhatsApp !== null) return envWhatsApp;
  try { envWhatsApp = String((await (await fetch('/api/config/whatsapp-number')).json()).whatsappNumber || ''); }
  catch { envWhatsApp = ''; }
  return envWhatsApp;
}
async function getSettings() {
  const rows = await q(sb().from('store_settings').select('key,value'), 'Loading settings');
  const out = { ...SETTING_DEFAULTS };
  for (const { key, value } of rows) out[key] = value;
  // The WhatsApp number checkout uses is WHATSAPP_BUSINESS_NUMBER on the server; show that one.
  out.whatsapp_number = await whatsappFromServer();
  return out;
}
async function allContent() {
  const rows = await q(sb().from('site_content').select('key,value'), 'Loading website content');
  return Object.fromEntries(Object.keys(CONTENT_DEFAULTS).map((k) => [k, { ...structuredClone(CONTENT_DEFAULTS[k]), ...(rows.find((r) => r.key === k)?.value || {}) }]));
}

/* ======================================================================
   Catalogue
   ====================================================================== */
const bySort = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.name).localeCompare(String(b.name));
async function loadCategories() { return q(sb().from('categories').select('*'), 'Loading categories'); }
/** Main categories in order, each followed by its subcategories. */
function tree(cats) {
  const tops = cats.filter((c) => !c.parent_id).sort(bySort);
  return tops.flatMap((t) => [t, ...cats.filter((c) => c.parent_id === t.id).sort(bySort)]);
}
const pathOf = (c, cats) => { const p = c.parent_id && cats.find((x) => x.id === c.parent_id); return p ? `${p.name} › ${c.name}` : c.name; };
const liveCat = (c, cats) => !!c?.status && (!c.parent_id || !!cats.find((x) => x.id === c.parent_id)?.status);
const withChildren = (id, cats) => new Set([id, ...cats.filter((c) => c.parent_id === id).map((c) => c.id)]);
const categoryRow = (c, cats, products) => {
  const ids = withChildren(c.id, cats);
  const inIt = products.filter((p) => p.category_ids.some((x) => ids.has(x)));
  return { id: c.id, parent_id: c.parent_id, name: c.name, slug: c.slug, description: c.description || '', image_url: imageUrl(c.image), image_alt: c.name,
    active: c.status ? 1 : 0, sort_order: c.sort_order ?? 0, path: pathOf(c, cats), child_count: cats.filter((x) => x.parent_id === c.id).length,
    product_count: inIt.length, active_count: inIt.filter((p) => p.active).length, created_at: ts(c.created_at), updated_at: ts(c.updated_at || c.created_at) };
};

const PRODUCT_SELECT = '*, product_images(*), product_categories(category_id)';
async function loadProductRows(filter) {
  let request = sb().from('products').select(PRODUCT_SELECT).order('created_at', { ascending: false });
  if (filter) request = filter(request);
  return q(request, 'Loading products');
}
/** A product shaped the way the admin pages expect it. */
function hydrate(p, cats, threshold) {
  const ordered = tree(cats);
  const ids = (p.product_categories || []).map((x) => x.category_id);
  const mine = ordered.filter((c) => ids.includes(c.id));
  let images = (p.product_images || []).slice().sort((a, b) => a.position - b.position)
    .map((im) => ({ id: im.id, url: imageUrl(im.public_url || im.storage_path), public_id: im.storage_path, alt: im.alt_text || '', sort_order: im.position }));
  if (!images.length && p.main_image) images = [{ id: null, url: imageUrl(p.main_image), public_id: p.main_image, alt: p.name, sort_order: 0 }];
  const onSale = p.sale_price !== null && p.sale_price !== undefined && money(p.sale_price) < money(p.price);
  const stock = p.stock_quantity ?? 0;
  const limit = p.low_stock_threshold > 0 ? p.low_stock_threshold : threshold;
  return {
    id: p.id, name: p.name, slug: p.slug, short_description: p.short_description || '', description: p.description || '',
    price: onSale ? money(p.sale_price) : money(p.price), compare_at_price: onSale ? money(p.price) : null,
    sku: p.sku || '', stock, low_stock_threshold: p.low_stock_threshold > 0 ? p.low_stock_threshold : null,
    // "out_of_stock" is still a live product: it comes back when restocked
    active: ['active', 'out_of_stock'].includes(p.status) ? 1 : 0, db_status: p.status,
    featured: p.featured ? 1 : 0, bestseller: p.bestseller ? 1 : 0,
    material: p.materials || '', size: p.dimensions || '', weight: p.weight || '', finish: p.finish || '', care: p.care_instructions || '',
    production_time: p.delivery_information || '',
    custom_available: p.personalizable ? 1 : 0, custom_type: p.photo_upload_required ? 'photo' : 'text',
    custom_instructions: p.customization_instructions || '', whatsapp_required: p.photo_upload_required ? 1 : 0,
    seo_title: p.seo_title || '', seo_description: p.seo_description || '',
    images, image: images[0]?.url || '', variants: [],
    category_ids: ids, category_id: mine[0]?.id ?? null,
    categories: mine.map((c) => ({ id: c.id, name: c.name, path: pathOf(c, cats), parent_id: c.parent_id })),
    category_name: mine.length ? mine.slice(0, 2).map((c) => c.name).join(', ') + (mine.length > 2 ? ` +${mine.length - 2}` : '') : '',
    category_sort: mine.length ? ordered.indexOf(mine[0]) : 9999, category_active: mine.some((c) => liveCat(c, cats)) ? 1 : 0,
    total_stock: stock, stock_status: stock <= 0 ? 'out_of_stock' : stock <= limit ? 'low_stock' : 'in_stock',
    sort_order: 0, created_at: ts(p.created_at), updated_at: ts(p.updated_at),
    max_photos: p.max_photos, max_text_length: p.max_text_length,
  };
}
async function catalog() {
  const [rows, cats, settings] = await Promise.all([loadProductRows(), loadCategories(), getSettings()]);
  const threshold = Number(settings.low_stock_threshold) || 0;
  return { cats, settings, products: rows.map((p) => hydrate(p, cats, threshold)) };
}
async function productById(id) {
  const [[row], cats, settings] = await Promise.all([loadProductRows((r) => r.eq('id', id)), loadCategories(), getSettings()]);
  return row ? hydrate(row, cats, Number(settings.low_stock_threshold) || 0) : null;
}

/** Validates the product form and turns it into a products row (plus images and categories). */
function productInput(b, current) {
  const str = (v, label, max, required = false) => {
    const s = String(v ?? '').trim();
    if (required && !s) throw bad(`${label} is required.`);
    if (s.length > max) throw bad(`${label} must be ${max} characters or fewer.`);
    return s;
  };
  const num = (v, label, { nullable = false, min = 0 } = {}) => {
    if (v === '' || v === null || v === undefined) { if (nullable) return null; throw bad(`${label} is required.`); }
    const n = Number(v);
    if (!Number.isFinite(n) || n < min) throw bad(`${label} must be ${min} or more.`);
    return n;
  };
  if (Array.isArray(b.variants) && b.variants.length) throw bad('Product options (sizes, designs) aren’t available in this store yet.');
  const price = num(b.price, 'Price');
  if (price <= 0) throw bad('Price must be more than ₹0.');
  const compare = num(b.compare_at_price, 'Compare price', { nullable: true });
  if (compare !== null && compare <= price) throw bad('Compare price should be higher than the price (or left empty).');
  const stock = Math.floor(num(b.stock ?? 0, 'Stock'));
  const custom = !!b.custom_available;
  const photo = custom && (b.custom_type === 'photo' || !!b.whatsapp_required);
  const text = custom && ['text', 'initial'].includes(b.custom_type || 'text');
  const images = (Array.isArray(b.images) ? b.images : []).filter((im) => im?.url);
  if (images.length > 12) throw bad('Up to 12 images per product.');
  const active = !!b.active;
  const row = {
    name: str(b.name, 'Product name', 120, true), short_description: str(b.short_description, 'Short description', 300) || null,
    description: str(b.description, 'Description', 5000) || null,
    // the store keeps the full price in `price` and the discounted one in `sale_price`
    price: compare ?? price, sale_price: compare !== null ? price : null,
    sku: str(b.sku, 'SKU', 60) || null, stock_quantity: stock,
    low_stock_threshold: b.low_stock_threshold === '' || b.low_stock_threshold === null || b.low_stock_threshold === undefined ? 0 : Math.floor(num(b.low_stock_threshold, 'Low stock threshold')),
    status: active ? (stock > 0 ? 'active' : 'out_of_stock') : current?.db_status === 'archived' ? 'archived' : 'draft',
    featured: !!b.featured, bestseller: !!b.bestseller,
    materials: str(b.material, 'Material', 120) || null, dimensions: str(b.size, 'Size', 120) || null,
    weight: str(b.weight, 'Weight', 120) || null, finish: str(b.finish, 'Finish', 120) || null,
    care_instructions: str(b.care, 'Care instructions', 500) || null, delivery_information: str(b.production_time, 'Production time', 200) || null,
    personalizable: custom, photo_upload_required: photo, custom_text_allowed: text,
    max_photos: photo ? Math.max(current?.max_photos || 0, 6) : current?.max_photos || 0,
    max_text_length: text ? Math.max(current?.max_text_length || 0, 240) : current?.max_text_length || 0,
    customization_instructions: custom ? str(b.custom_instructions, 'Customization instructions', 500) || null : null,
    seo_title: str(b.seo_title, 'SEO title', 70) || null, seo_description: str(b.seo_description, 'Meta description', 160) || null,
    main_image: images[0]?.url || null,
  };
  row.slug = slugify(b.slug || row.name);
  if (!row.slug) throw bad('Slug is required.');
  return { row, images, categoryIds: [...new Set((Array.isArray(b.category_ids) ? b.category_ids : []).map(String))] };
}
async function logStock(productId, before, after, admin) {
  if (before === after) return;
  await q(sb().from('inventory_movements').insert({ product_id: productId, previous_quantity: before, change_quantity: after - before, new_quantity: after,
    reason: 'manual_adjustment', admin_user_id: admin.id }), 'Recording the stock change');
}
async function saveProduct(b, id = null) {
  const admin = await currentAdmin();
  const current = id ? await productById(id) : null;
  if (id && !current) throw notFound('Product not found.');
  const { row, images, categoryIds } = productInput(b, current);
  const saved = id
    ? await q(sb().from('products').update(row).eq('id', id).select('id').single(), 'Saving the product')
    : await q(sb().from('products').insert(row).select('id').single(), 'Creating the product');
  const pid = saved.id;
  // photos: replace the set, keeping their order (position 0 is the main photo)
  await q(sb().from('product_images').delete().eq('product_id', pid), 'Saving photos');
  if (images.length) {
    await q(sb().from('product_images').insert(images.map((im, i) => ({ product_id: pid, storage_path: im.public_id || im.url, public_url: im.url, alt_text: im.alt || null, position: i }))), 'Saving photos');
  }
  await q(sb().from('product_categories').delete().eq('product_id', pid), 'Saving categories');
  if (categoryIds.length) await q(sb().from('product_categories').insert(categoryIds.map((category_id) => ({ product_id: pid, category_id }))), 'Saving categories');
  await logStock(pid, current ? current.stock : 0, row.stock_quantity, admin);
  return productById(pid);
}

/* ======================================================================
   Orders
   ====================================================================== */
const ORDER_SELECT = '*, customer:customers(*), order_items(*)';
async function loadOrderRows(filter) {
  let request = sb().from('orders').select(ORDER_SELECT).order('created_at', { ascending: false });
  if (filter) request = filter(request);
  return q(request, 'Loading orders');
}
async function productLookup() {
  const rows = await q(sb().from('products').select('id,name,personalizable,photo_upload_required,customization_instructions,main_image,sku,product_images(public_url,storage_path,position)'), 'Loading products');
  return new Map(rows.map((p) => [p.id, { ...p, image: imageUrl(p.product_images?.slice().sort((a, b) => a.position - b.position)[0]?.public_url || p.main_image) }]));
}
function itemRow(it, products) {
  const p = products.get(it.product_id);
  return { id: it.id, order_id: it.order_id, product_id: it.product_id, variant_id: null, product_name: it.product_name_snapshot, variant_name: '',
    sku: p?.sku || '', image_url: p?.image || '', unit_price: money(it.price_snapshot), quantity: it.quantity,
    subtotal: money(it.price_snapshot) * it.quantity, customization: it.customization_text || '' };
}
/** Personalised items: anything from a personalizable product, or with customer text, or already being tracked. */
const isCustom = (it, products) => !!(it.custom_status || it.customization_text || products.get(it.product_id)?.personalizable);
function customState(it, products) {
  const p = products.get(it.product_id);
  const photo = !!p?.photo_upload_required;
  return {
    status: it.custom_status || (photo ? 'photos_pending' : it.customization_text ? 'requirements_received' : 'waiting_for_customer'),
    photo_status: it.photo_status || (photo ? 'pending' : 'not_required'),
  };
}
function orderRow(o, products) {
  const items = (o.order_items || []).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const custom = items.filter((it) => isCustom(it, products));
  return {
    id: o.id, number: o.order_number, customer_id: o.customer_id,
    customer_name: o.shipping_name || o.customer?.name || '', phone: o.shipping_phone || o.customer?.phone || '', email: o.email || o.customer?.email || '',
    shipping_address: o.shipping_address || '', shipping_city: o.shipping_city || '', shipping_state: o.shipping_state || '', shipping_pincode: o.shipping_postal_code || '',
    customer_note: '', subtotal: money(o.subtotal), discount: money(o.discount), shipping: money(o.shipping_fee), total: money(o.total),
    status: ORDER_TO_ADMIN[o.order_status] || 'order_placed', db_status: o.order_status,
    payment_status: PAY_TO_ADMIN[o.payment_status] || 'pending',
    payment_method: o.payment_method || (o.razorpay_payment_id ? 'razorpay' : ''), payment_reference: o.razorpay_payment_id || '',
    payment_confirmed_at: o.payment_status === 'paid' ? ts(o.created_at) : null,
    source: o.razorpay_order_id ? 'website' : 'admin', tracking_number: o.tracking_number || '',
    created_at: ts(o.created_at), updated_at: ts(o.updated_at),
    item_count: items.length, quantity: items.reduce((s, i) => s + i.quantity, 0), first_item: items[0]?.product_name_snapshot || '',
    first_image: products.get(items[0]?.product_id)?.image || '',
    custom_count: custom.length, custom_open: custom.filter((it) => customState(it, products).status !== 'completed').length,
  };
}
async function orders() {
  const [rows, products] = await Promise.all([loadOrderRows(), productLookup()]);
  return { rows, products, list: rows.map((o) => orderRow(o, products)) };
}
function allowedStatuses(o, hasCustom) {
  if (!o || ['cancelled', 'delivered'].includes(o.status)) return [];
  return ORDER_STATUSES.map(([k]) => k).filter((k) => {
    if (k === o.status) return false;
    if (k === 'order_placed') return o.payment_status !== 'confirmed';
    if (k === 'cancelled') return true;
    if (k.startsWith('customization_') && !hasCustom) return false;
    return o.payment_status === 'confirmed';
  });
}
async function addEvent(orderId, kind, from, to, message, admin) {
  await q(sb().from('order_events').insert({ order_id: orderId, kind, from_value: from, to_value: to, message: message || '', admin_user_id: admin.id }), 'Updating the order timeline');
}
/** The same best-effort status email the old admin sent (api/orders/notify-status). Never blocks the change. */
async function notifyStatus(orderId, previousDbStatus, admin) {
  try {
    const res = await fetch('/api/orders/notify-status', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` },
      body: JSON.stringify({ order_id: orderId, previous_status: previousDbStatus }) });
    if (!res.ok) console.warn('Order status email could not be sent:', (await res.json().catch(() => null))?.error || res.status);
  } catch (err) { console.warn('Order status email could not be sent:', err); }
}
async function orderDetail(id) {
  const [[o], products, events, notes, assets, admin] = await Promise.all([
    loadOrderRows((r) => r.eq('id', id)), productLookup(),
    q(sb().from('order_events').select('*').eq('order_id', id).order('created_at'), 'Loading the timeline'),
    q(sb().from('order_notes').select('*').eq('order_id', id).order('created_at'), 'Loading notes'),
    q(sb().from('personalization_assets').select('order_item_id,public_url,storage_path').eq('order_id', id), 'Loading photos'),
    currentAdmin(),
  ]);
  if (!o) return null;
  const row = orderRow(o, products);
  const items = (o.order_items || []).map((it) => itemRow(it, products));
  const custom = (o.order_items || []).filter((it) => isCustom(it, products)).map((it) => ({
    id: it.id, order_id: o.id, order_item_id: it.id, ...customState(it, products), approval_status: it.approval_status || 'pending',
    requirements: products.get(it.product_id)?.customization_instructions || '', customer_instructions: it.customization_text || '',
    admin_notes: it.admin_notes || '', photos: assets.filter((a) => a.order_item_id === it.id).map((a) => a.public_url || a.storage_path),
    product_name: it.product_name_snapshot, variant_name: '', created_at: ts(it.created_at), updated_at: ts(it.custom_updated_at || it.created_at),
  }));
  // Timeline: when the order was placed and paid (from the order itself), then every admin change and note.
  const timeline = [
    { id: 'placed', order_id: o.id, kind: 'status', from_value: null, to_value: 'order_placed', message: row.source === 'website' ? 'Order placed on the website' : 'Order created in the admin panel', admin_name: '', created_at: row.created_at },
    ...(o.payment_status === 'paid' && o.razorpay_payment_id ? [{ id: 'paid', order_id: o.id, kind: 'payment', from_value: 'pending', to_value: 'confirmed', message: `Paid online with Razorpay (${o.razorpay_payment_id})`, admin_name: '', created_at: row.created_at }] : []),
    ...events.map((e) => ({ id: e.id, order_id: o.id, kind: e.kind, from_value: e.from_value, to_value: e.to_value, message: e.message, admin_name: e.admin_user_id ? admin.name : '', created_at: ts(e.created_at) })),
    ...notes.map((n) => ({ id: n.id, order_id: o.id, kind: 'note', from_value: null, to_value: null, message: `Note: ${n.note}`, admin_name: admin.name, created_at: ts(n.created_at) })),
  ].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  return {
    ...row, items, custom, events: timeline, admin_notes: notes.at(-1)?.note || '',
    payment: { status: row.payment_status, amount: row.total, method: row.payment_method, reference: row.payment_reference, confirmed_at: row.payment_confirmed_at, confirmed_by: '' },
    allowed: allowedStatuses(row, custom.length > 0),
  };
}

/* ======================================================================
   Customers
   ====================================================================== */
function customerStats(c, list) {
  const mine = list.filter((o) => o.customer_id === c.id);
  return { id: c.id, name: c.name || mine[0]?.customer_name || c.email, phone: c.phone || mine[0]?.phone || '', email: c.email || '', notes: c.notes || '',
    city: mine[0]?.shipping_city || '', created_at: ts(c.created_at), updated_at: ts(c.updated_at),
    order_count: mine.filter((o) => o.status !== 'cancelled').length,
    total_spent: mine.filter((o) => o.payment_status === 'confirmed').reduce((s, o) => s + o.total, 0),
    last_order: mine.map((o) => o.created_at).sort().at(-1) || null };
}

/* ======================================================================
   List helpers (the same behaviour the pages were designed against)
   ====================================================================== */
const PAGE = 12;
function paginate(rows, page) {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const p = Math.min(Math.max(1, Number(page) || 1), pages);
  return { rows: rows.slice((p - 1) * PAGE, p * PAGE), page: p, pages, total: rows.length, perPage: PAGE };
}
function applySort(rows, sort, keys, fallback) {
  const desc = String(sort || '').endsWith('_desc');
  const cmp = keys[String(sort || '').replace(/_desc$/, '')];
  return rows.sort(cmp ? (a, b) => (desc ? -cmp(a, b) : cmp(a, b)) : fallback);
}
const has = (hay, t) => String(hay || '').toLowerCase().replace(/\s/g, '').includes(t);
const termOf = (qs) => String(qs.get('q') || '').slice(0, 80).toLowerCase().replace(/\s/g, '');
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
const dayKey = (d) => dayFmt.format(d);
const dayOf = (s) => (s ? dayKey(new Date(`${String(s).replace(' ', 'T')}Z`)) : '');
const monthOf = (s) => dayOf(s).slice(0, 7);
function monthKeys() {
  const [y, m] = dayKey(new Date()).split('-').map(Number);
  return { cur: `${y}-${String(m).padStart(2, '0')}`, prev: m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}` };
}
function monthChange(list, key, valueFn = () => 1, filter = () => true) {
  const { cur: c, prev: p } = monthKeys();
  let cur = 0, prev = 0;
  for (const x of list) {
    if (!filter(x) || !x[key]) continue;
    const mk = monthOf(x[key]);
    if (mk === c) cur += valueFn(x); else if (mk === p) prev += valueFn(x);
  }
  return { value: cur, change: prev ? Math.round(((cur - prev) / prev) * 100) : null };
}
function chart(list, range) {
  const spec = { '7d': [7, 'day'], '30d': [30, 'day'], '3m': [13, 'week'], '1y': [12, 'month'] }[range];
  if (!spec) throw bad('Unknown range.');
  const [n, unit] = spec;
  const [ty, tm, td] = dayKey(new Date()).split('-').map(Number);
  const today = new Date(ty, tm - 1, td);
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const buckets = [];
  for (let i = n - 1; i >= 0; i--) {
    let start, end;
    if (unit === 'day') { start = new Date(today); start.setDate(today.getDate() - i); end = new Date(start); }
    else if (unit === 'week') { end = new Date(today); end.setDate(today.getDate() - i * 7); start = new Date(end); start.setDate(end.getDate() - 6); }
    else { start = new Date(today.getFullYear(), today.getMonth() - i, 1); end = new Date(today.getFullYear(), today.getMonth() - i + 1, 0); }
    buckets.push({ start: key(start), end: key(end), orders: 0, revenue: 0, unit });
  }
  for (const o of list) {
    if (o.status === 'cancelled') continue;
    const b = buckets.find((x) => dayOf(o.created_at) >= x.start && dayOf(o.created_at) <= x.end);
    if (b) { b.orders += 1; if (o.payment_status === 'confirmed') b.revenue += o.total; }
  }
  return { range, buckets, orders: buckets.reduce((s, b) => s + b.orders, 0), revenue: buckets.reduce((s, b) => s + b.revenue, 0) };
}
function badges(list, products, custom, pendingReviews) {
  const open = list.filter((o) => o.status === 'order_placed');
  return { orders: open.length, custom_orders: custom.filter((c) => ['waiting_for_customer', 'photos_pending'].includes(c.status) && c.order_status !== 'cancelled').length,
    whatsapp: list.filter((o) => ['payment_confirmed', 'customization_pending'].includes(o.status)).length,
    reviews: pendingReviews, inventory: products.filter((p) => p.active && p.stock_status !== 'in_stock').length };
}
/** Every personalised item as a row of the Custom Orders page. */
function customRows(rows, products, list, settings, assets) {
  const byId = new Map(list.map((o) => [o.id, o]));
  return rows.flatMap((o) => (o.order_items || []).filter((it) => isCustom(it, products)).map((it) => {
    const order = byId.get(o.id);
    const row = { id: it.id, order_id: o.id, order_item_id: it.id, ...customState(it, products), approval_status: it.approval_status || 'pending',
      requirements: products.get(it.product_id)?.customization_instructions || '', customer_instructions: it.customization_text || '', admin_notes: it.admin_notes || '',
      photos: (assets || []).filter((a) => a.order_item_id === it.id).map((a) => a.public_url || a.storage_path),
      number: order.number, customer_name: order.customer_name, phone: order.phone, order_status: order.status, order_date: order.created_at,
      customer_id: order.customer_id, product_name: it.product_name_snapshot, variant_name: '', quantity: it.quantity, image_url: products.get(it.product_id)?.image || '',
      created_at: ts(it.created_at), updated_at: ts(it.custom_updated_at || it.created_at) };
    row.chat = customerChatLink(row, settings, fillTemplate(settings.whatsapp_custom_template,
      { number: row.number, customer_name: row.customer_name, total: 0, items: [{ product_name: row.product_name, quantity: row.quantity }] }, settings));
    return row;
  })).sort((a, b) => String(b.order_date).localeCompare(String(a.order_date)));
}

/* ======================================================================
   Routes
   ====================================================================== */
const R = [];
const on = (method, pattern, fn) => R.push([method, new RegExp(`^${pattern.replace(/:\w+/g, '([\\w-]+)')}$`), fn]);

on('GET', '/me', async () => {
  const admin = await currentAdmin();
  const [{ rows, products: lookup, list }, cat, reviews, settings] = await Promise.all([orders(), catalog(), q(sb().from('reviews').select('id,status'), 'Loading reviews'), getSettings()]);
  return { admin: { id: admin.id, email: admin.email, name: admin.name }, badges: badges(list, cat.products, customRows(rows, lookup, list, settings), reviews.filter((r) => r.status === 'pending').length),
    store_name: settings.store_name, database: true };
});
on('POST', '/logout', async () => { await sb().auth.signOut(); adminCache = null; return { ok: true }; });
on('POST', '/password', async (_, __, b) => {
  const admin = await currentAdmin();
  if (!String(b.current || '')) throw bad('Enter your current password.');
  if (String(b.next || '').length < 8) throw bad('Use at least 8 characters for the new password.');
  const check = await sb().auth.signInWithPassword({ email: admin.email, password: String(b.current) });
  if (check.error) throw bad('Your current password is not correct.');
  const { error } = await sb().auth.updateUser({ password: String(b.next) });
  if (error) throw bad(error.message);
  return { ok: true };
});
on('PUT', '/profile', async (_, __, b) => {
  const name = String(b.name || '').trim().slice(0, 60);
  if (!name) throw bad('Name is required.');
  const { error } = await sb().auth.updateUser({ data: { full_name: name } });
  if (error) throw bad(error.message);
  return { ok: true };
});

on('GET', '/meta', async () => {
  const cats = await loadCategories();
  return {
    order_statuses: ORDER_STATUSES, workflow: WORKFLOW, payment_statuses: PAYMENT_STATUSES.map(([k]) => k), payment_labels: Object.fromEntries(PAYMENT_STATUSES),
    payment_methods: PAYMENT_METHODS, method_labels: { ...METHOD_LABELS, razorpay: 'Razorpay' }, custom_statuses: CUSTOM_STATUSES,
    photo_statuses: PHOTO_STATUSES, approval_statuses: APPROVAL_STATUSES,
    categories: tree(cats).map((c) => ({ id: c.id, name: c.name, parent_id: c.parent_id, path: pathOf(c, cats) })),
    features: { variants: false },
  };
});

on('GET', '/dashboard', async (_, qs) => {
  const [{ rows, products: lookup, list }, cat, customers, events, settings] = await Promise.all([
    orders(), catalog(), q(sb().from('customers').select('*'), 'Loading customers'),
    q(sb().from('order_events').select('*').order('created_at', { ascending: false }).limit(7), 'Loading activity'), getSettings()]);
  const today = dayKey(new Date());
  const { cur } = monthKeys();
  const paid = list.filter((o) => o.payment_status === 'confirmed').map((o) => ({ amount: o.total, paid_at: o.payment_confirmed_at }));
  const custom = customRows(rows, lookup, list, settings);
  const openCustom = custom.filter((c) => c.status !== 'completed' && c.order_status !== 'cancelled');
  const low = cat.products.filter((p) => p.active && p.stock_status !== 'in_stock');
  const count = (fn) => list.filter(fn).length;
  const people = customers.map((c) => customerStats(c, list));
  // recent activity: admin changes, plus new orders
  const activity = [...events.map((e) => ({ ...e, created_at: ts(e.created_at) })), ...list.slice(0, 7).map((o) => ({ id: `placed-${o.id}`, order_id: o.id, kind: 'status', from_value: null, to_value: 'order_placed', message: 'Order placed', created_at: o.created_at }))]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 7)
    .map((e) => { const o = list.find((x) => x.id === e.order_id); return { ...e, number: o?.number || '', customer_name: o?.customer_name || '' }; });
  return {
    stats: {
      total_revenue: paid.reduce((s, p) => s + p.amount, 0),
      today_revenue: paid.filter((p) => dayOf(p.paid_at) === today).reduce((s, p) => s + p.amount, 0),
      month_revenue: paid.filter((p) => monthOf(p.paid_at) === cur).reduce((s, p) => s + p.amount, 0),
      today_orders: count((o) => dayOf(o.created_at) === today), total_orders: count((o) => o.status !== 'cancelled'),
      pending_orders: count((o) => o.status === 'order_placed'), preparing_orders: count((o) => PREPARING.includes(o.status)),
      shipped_orders: count((o) => o.status === 'shipped'), delivered_orders: count((o) => o.status === 'delivered'), cancelled_orders: count((o) => o.status === 'cancelled'),
      custom_orders: openCustom.length, pending_customizations: openCustom.filter((c) => ['waiting_for_customer', 'photos_pending'].includes(c.status)).length,
      total_customers: people.length, low_stock: low.length, low_stock_threshold: Number(settings.low_stock_threshold) || 0,
      month: { orders: monthChange(list, 'created_at', () => 1, (o) => o.status !== 'cancelled'), revenue: monthChange(paid, 'paid_at', (p) => p.amount),
        customers: monthChange(people, 'created_at'), custom: monthChange(custom, 'created_at') },
    },
    recent: list.slice(0, 6),
    whatsapp: list.filter((o) => ['payment_confirmed', 'customization_pending'].includes(o.status)).slice(0, 5).map((o) => ({ ...o, chat: customerChatLink(o, settings) })),
    low_stock: low.sort((a, b) => a.total_stock - b.total_stock).slice(0, 5),
    customers: people.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 5),
    activity, chart: chart(list, qs.get('range') || '30d'),
  };
});
on('GET', '/chart', async (_, qs) => chart((await orders()).list, qs.get('range') || '30d'));
on('GET', '/search', async (_, qs) => {
  const raw = String(qs.get('q') || '').trim().toLowerCase();
  if (raw.length < 2) return { products: [], orders: [], customers: [] };
  const digits = raw.replace(/\D/g, '');
  const hit = (s) => String(s || '').toLowerCase().includes(raw);
  const phoneHit = (s) => digits.length >= 3 && String(s || '').replace(/\D/g, '').includes(digits);
  const [{ list }, cat, customers] = await Promise.all([orders(), catalog(), q(sb().from('customers').select('id,name,phone,email'), 'Searching')]);
  return {
    products: cat.products.filter((p) => hit(p.name) || hit(p.sku)).slice(0, 5).map(({ id, name, sku }) => ({ id, name, sku })),
    orders: list.filter((o) => hit(o.number) || hit(o.customer_name) || hit(o.email) || phoneHit(o.phone)).slice(0, 5).map(({ id, number, customer_name, total }) => ({ id, number, customer_name, total })),
    customers: customers.filter((c) => hit(c.name) || hit(c.email) || phoneHit(c.phone)).slice(0, 5).map(({ id, name, phone }) => ({ id, name, phone: phone || '' })),
  };
});

/* Products */
on('GET', '/products', async (_, qs) => {
  const t = termOf(qs), f = qs.get('filter') || 'all', cat = qs.get('category') || '';
  const { products: all, cats } = await catalog();
  const inCat = cat ? withChildren(cat, cats) : null;
  let rows = all.filter((x) => (!t || has(x.name, t) || has(x.sku, t)) && (!inCat || x.category_ids.some((id) => inCat.has(id))));
  rows = rows.filter((x) => ({ all: true, active: x.active, inactive: !x.active, featured: x.featured, bestseller: x.bestseller,
    low_stock: x.stock_status === 'low_stock', out_of_stock: x.stock_status === 'out_of_stock' })[f] ?? true);
  applySort(rows, qs.get('sort'), { name: (a, b) => a.name.localeCompare(b.name), price: (a, b) => a.price - b.price, stock: (a, b) => a.total_stock - b.total_stock,
    category: (a, b) => a.category_name.localeCompare(b.category_name), newest: (a, b) => String(b.created_at).localeCompare(String(a.created_at)) }, () => 0);
  const counts = { all: all.length, active: all.filter((x) => x.active).length, inactive: all.filter((x) => !x.active).length,
    featured: all.filter((x) => x.featured).length, bestseller: all.filter((x) => x.bestseller).length,
    low_stock: all.filter((x) => x.stock_status === 'low_stock').length, out_of_stock: all.filter((x) => x.stock_status === 'out_of_stock').length };
  return { ...paginate(rows, qs.get('page')), counts };
});
on('GET', '/products/:id', async (m) => (await productById(m[1])) || (() => { throw notFound('Product not found.'); })());
on('POST', '/products', (_, __, b) => saveProduct(b));
on('PUT', '/products/:id', (m, _, b) => saveProduct(b, m[1]));
on('PATCH', '/products/:id', async (m, _, b) => {
  const current = await productById(m[1]);
  if (!current) throw notFound('Product not found.');
  const patch = {};
  if (b.featured !== undefined) patch.featured = !!b.featured;
  if (b.bestseller !== undefined) patch.bestseller = !!b.bestseller;
  if (b.active !== undefined) patch.status = b.active ? (current.stock > 0 ? 'active' : 'out_of_stock') : 'draft';
  if (!Object.keys(patch).length) throw bad('Nothing to change.');
  await q(sb().from('products').update(patch).eq('id', current.id), 'Updating the product');
  return productById(current.id);
});
on('POST', '/products/:id/duplicate', async (m) => {
  const src = await productById(m[1]);
  if (!src) throw notFound('Product not found.');
  const taken = new Set((await q(sb().from('products').select('slug'), 'Checking slugs')).map((r) => r.slug));
  let slug = `${src.slug}-copy`, n = 2;
  while (taken.has(slug)) slug = `${src.slug}-copy-${n++}`;
  return saveProduct({ ...src, name: `${src.name} (Copy)`.slice(0, 120), slug, sku: '', active: 0, featured: 0, bestseller: 0, variants: [] });
});
on('DELETE', '/products/:id', async (m) => {
  const current = await productById(m[1]);
  if (!current) throw notFound('Product not found.');
  // Products that were ordered stay in the database (order history refers to them): archive those instead.
  const ordered = await q(sb().from('order_items').select('id').eq('product_id', current.id).limit(1), 'Checking orders');
  if (ordered.length) { await q(sb().from('products').update({ status: 'archived' }).eq('id', current.id), 'Archiving the product'); return { ok: true, archived: true }; }
  await q(sb().from('product_categories').delete().eq('product_id', current.id), 'Deleting the product');
  await q(sb().from('product_images').delete().eq('product_id', current.id), 'Deleting the product');
  await q(sb().from('inventory_movements').delete().eq('product_id', current.id), 'Deleting the product');
  await q(sb().from('products').delete().eq('id', current.id), 'Deleting the product');
  return { ok: true };
});
on('GET', '/product-options', async () => ({ rows: (await catalog()).products.filter((p) => p.active && p.category_active).sort((a, b) => a.name.localeCompare(b.name)) }));

/* Categories */
function categoryInput(b) {
  const name = String(b.name || '').trim();
  if (!name) throw bad('Category name is required.');
  const slug = slugify(b.slug || name);
  if (!slug) throw bad('Slug is required.');
  return { name: name.slice(0, 80), slug, parent_id: b.parent_id || null, description: String(b.description || '').trim().slice(0, 300) || null, image: b.image_url || null, status: !!b.active };
}
async function categoryRowById(id) {
  const [cats, { products }] = await Promise.all([loadCategories(), catalog()]);
  const c = cats.find((x) => x.id === id);
  return c ? categoryRow(c, cats, products) : null;
}
on('GET', '/categories', async () => {
  const { cats, products } = await catalog();
  return { rows: tree(cats).map((c) => categoryRow(c, cats, products)) };
});
on('POST', '/categories', async (_, __, b) => {
  const input = categoryInput(b);
  const siblings = await q(sb().from('categories').select('sort_order').filter('parent_id', input.parent_id ? 'eq' : 'is', input.parent_id || null), 'Creating the category');
  const row = await q(sb().from('categories').insert({ ...input, sort_order: Math.max(-1, ...siblings.map((s) => s.sort_order ?? 0)) + 1 }).select('id').single(), 'Creating the category');
  return categoryRowById(row.id);
});
on('PUT', '/categories/:id', async (m, _, b) => {
  const input = categoryInput(b);
  await q(sb().from('categories').update(input).eq('id', m[1]), 'Saving the category');
  return categoryRowById(m[1]);
});
on('PATCH', '/categories/:id', async (m, _, b) => {
  await q(sb().from('categories').update({ status: !!b.active }).eq('id', m[1]), 'Updating the category');
  return categoryRowById(m[1]);
});
on('POST', '/categories/reorder', async (_, __, b) => {
  if (!Array.isArray(b.ids) || !b.ids.length) throw bad('Expected a list of categories.');
  await Promise.all(b.ids.map((id, i) => q(sb().from('categories').update({ sort_order: i }).eq('id', id), 'Reordering')));
  return { ok: true };
});
on('DELETE', '/categories/:id', async (m) => {
  const cats = await loadCategories();
  const gone = [...withChildren(m[1], cats)];
  await q(sb().from('product_categories').delete().in('category_id', gone), 'Deleting the category');   // products stay; they just leave it
  await q(sb().from('categories').delete().in('id', gone), 'Deleting the category');
  return { ok: true };
});

/* Orders */
const pendingPay = (o) => o.payment_status !== 'confirmed' && o.payment_status !== 'refunded' && o.status !== 'cancelled';
on('GET', '/orders', async (_, qs) => {
  const t = termOf(qs), f = qs.get('filter') || 'all', cust = qs.get('customer') || '';
  const all = (await orders()).list.filter((o) => !cust || o.customer_id === cust);
  const rows = all.filter((o) => (!t || has(o.number, t) || has(o.customer_name, t) || has(o.phone, t.replace(/\D/g, '') || t) || has(o.email, t))
    && (f === 'all' || (f === 'pending' ? pendingPay(o) : f === 'confirmed' ? o.payment_status === 'confirmed' : o.status === f)));
  applySort(rows, qs.get('sort'), { number: (a, b) => a.number.localeCompare(b.number), customer: (a, b) => a.customer_name.localeCompare(b.customer_name),
    total: (a, b) => a.total - b.total, date: (a, b) => String(a.created_at).localeCompare(String(b.created_at)) }, () => 0);
  const counts = Object.fromEntries([['all', all.length], ['pending', all.filter(pendingPay).length], ['confirmed', all.filter((o) => o.payment_status === 'confirmed').length],
    ...ORDER_STATUSES.map(([k]) => [k, all.filter((o) => o.status === k).length])]);
  return { ...paginate(rows, qs.get('page')), counts };
});
/** Orders taken over WhatsApp or phone. Prices and stock come from the catalogue; payment starts as pending. */
on('POST', '/orders', async (_, __, b) => {
  const admin = await currentAdmin();
  const c = b.customer || {};
  const name = String(c.name || '').trim(), phone = String(c.phone || '').trim(), email = String(c.email || '').trim().toLowerCase();
  if (name.length < 2) throw bad('Name is required.');
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) throw bad('Please enter a valid phone number.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Please enter a valid email address.');
  if (!Array.isArray(b.items) || !b.items.length) throw bad('Add at least one product.');
  const { products } = await catalog();
  const lines = b.items.map((raw) => {
    const p = products.find((x) => x.id === raw.productId);
    if (!p || !p.active) throw bad('One of the products is no longer available.');
    const qty = Number(raw.quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) throw bad('Quantity must be between 1 and 20.');
    if (p.stock < qty) throw bad(p.stock > 0 ? `Only ${p.stock} of ${p.name} left in stock.` : `${p.name} is sold out.`);
    const text = [raw.customization?.initial ? `Initial "${String(raw.customization.initial).trim().toUpperCase().slice(0, 1)}"` : '', String(raw.customization?.text || '').trim().slice(0, 240)].filter(Boolean).join('; ');
    return { p, qty, text };
  });
  const last10 = digits.slice(-10);
  const existing = await q(sb().from('customers').select('*'), 'Finding the customer');
  let customer = existing.find((x) => (email && x.email?.toLowerCase() === email) || (x.phone && x.phone.replace(/\D/g, '').slice(-10) === last10));
  if (!customer) {
    customer = await q(sb().from('customers').insert({ name, phone, email: email || `wa-${digits}@orders.foreverhandy.invalid` }).select('*').single(), 'Creating the customer');
  }
  const subtotal = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
  const address = String(c.address || '').trim();
  const order = await q(sb().from('orders').insert({
    order_number: `FH-${Date.now().toString(36).toUpperCase().slice(-6)}${Math.random().toString(36).slice(2, 4).toUpperCase()}`,
    customer_id: customer.id, subtotal, discount: 0, shipping_fee: 0, total: subtotal, payment_status: 'pending', order_status: 'pending',
    shipping_name: name, shipping_phone: phone, shipping_address: address || 'To be confirmed on WhatsApp', email: email || null,
  }).select('id,order_number').single(), 'Creating the order');
  await q(sb().from('order_items').insert(lines.map((l) => ({ order_id: order.id, product_id: l.p.id, product_name_snapshot: l.p.name, price_snapshot: l.p.price, quantity: l.qty, customization_text: l.text || null }))), 'Adding the order items');
  for (const l of lines) {
    const after = l.p.stock - l.qty;
    await q(sb().from('products').update({ stock_quantity: after, ...(after === 0 && l.p.db_status === 'active' ? { status: 'out_of_stock' } : {}) }).eq('id', l.p.id), 'Updating stock');
    await q(sb().from('inventory_movements').insert({ product_id: l.p.id, previous_quantity: l.p.stock, change_quantity: -l.qty, new_quantity: after, reason: 'order', admin_user_id: admin.id }), 'Updating stock');
  }
  if (c.note) await q(sb().from('order_notes').insert({ order_id: order.id, admin_user_id: admin.id, note: String(c.note).slice(0, 2000) }), 'Saving the note');
  return { id: order.id, number: order.order_number };
});
on('GET', '/orders/:id', async (m) => {
  const o = await orderDetail(m[1]);
  if (!o) throw notFound('Order not found.');
  const settings = await getSettings();
  return { ...o, chat: customerChatLink(o, settings), message: fillTemplate(settings.whatsapp_template, o, settings) };
});
on('POST', '/orders/:id/status', async (m, _, b) => {
  const admin = await currentAdmin();
  const o = await orderDetail(m[1]);
  if (!o) throw notFound('Order not found.');
  if (!ORDER_TO_DB[b.status]) throw bad('Status is not valid.');
  if (!o.allowed.includes(b.status)) {
    if (o.payment_status !== 'confirmed' && b.status !== 'cancelled') throw bad('The order has to be paid before it moves forward.');
    throw bad(`An order that is ${statusLabel(o.status)} can’t be moved to ${statusLabel(b.status)}.`);
  }
  await q(sb().from('orders').update({ order_status: ORDER_TO_DB[b.status] }).eq('id', o.id), 'Updating the order');
  await addEvent(o.id, 'status', o.status, b.status, String(b.note || '').slice(0, 300), admin);
  await notifyStatus(o.id, o.db_status, admin);
  return { ok: true };
});
/** Razorpay marks online orders paid. Admins record payments taken outside the website, and refunds. */
on('POST', '/orders/:id/payment', async (m, _, b) => {
  const admin = await currentAdmin();
  const o = await orderDetail(m[1]);
  if (!o) throw notFound('Order not found.');
  const to = b.status;
  if (!PAY_TO_DB[to]) throw bad('Payment status is not valid.');
  if (to === o.payment_status) throw bad('The payment already has that status.');
  const ok = (o.payment_status === 'pending' && ['confirmed', 'failed'].includes(to)) || (o.payment_status === 'failed' && ['confirmed', 'pending'].includes(to))
    || (o.payment_status === 'confirmed' && to === 'refunded');
  if (!ok) throw bad(o.payment_status === 'refunded' ? 'This payment was refunded; it can’t be changed.' : to === 'refunded' ? 'Only a paid order can be refunded.' : 'A paid order can only be marked refunded.');
  if (to === 'confirmed' && o.status === 'cancelled') throw bad('This order is cancelled.');
  const patch = { payment_status: PAY_TO_DB[to] };
  if (to === 'confirmed') {
    if (b.method && !PAYMENT_METHODS.includes(b.method)) throw bad('Payment method is not valid.');
    patch.payment_method = b.method || null;
    if (o.status === 'order_placed') patch.order_status = o.custom.length ? 'customization_pending' : 'confirmed';
  }
  await q(sb().from('orders').update(patch).eq('id', o.id), 'Updating the payment');
  const ref = String(b.reference || '').trim().slice(0, 120);
  const how = [b.method && String(b.method).replace('_', ' '), ref].filter(Boolean).join(', ');
  await addEvent(o.id, 'payment', o.payment_status, to, { confirmed: `Payment confirmed${how ? ` (${how})` : ''}`, failed: `Payment marked failed${ref ? `: ${ref}` : ''}`,
    refunded: `Payment refunded${ref ? `: ${ref}` : ''}`, pending: 'Payment back to pending' }[to], admin);
  if (patch.order_status) {
    await addEvent(o.id, 'status', 'order_placed', ORDER_TO_ADMIN[patch.order_status], '', admin);
    await notifyStatus(o.id, o.db_status, admin);
  }
  return { ok: true };
});
on('PATCH', '/orders/:id', async (m, _, b) => {
  const admin = await currentAdmin();
  const note = String(b.admin_notes || '').trim().slice(0, 2000);
  if (note) await q(sb().from('order_notes').insert({ order_id: m[1], admin_user_id: admin.id, note }), 'Saving the note');
  return { ok: true };
});

/* Customers */
on('GET', '/customers', async (_, qs) => {
  const t = termOf(qs);
  const [customers, { list }] = await Promise.all([q(sb().from('customers').select('*'), 'Loading customers'), orders()]);
  const rows = customers.map((c) => customerStats(c, list)).filter((c) => !t || has(c.name, t) || has(c.phone, t.replace(/\D/g, '') || t) || has(c.email, t));
  applySort(rows, qs.get('sort'), { name: (a, b) => a.name.localeCompare(b.name), orders: (a, b) => a.order_count - b.order_count, spent: (a, b) => a.total_spent - b.total_spent,
    last: (a, b) => String(a.last_order || '').localeCompare(String(b.last_order || '')), joined: (a, b) => String(a.created_at).localeCompare(String(b.created_at)) },
  (a, b) => String(b.last_order || b.created_at).localeCompare(String(a.last_order || a.created_at)));
  return paginate(rows, qs.get('page'));
});
on('GET', '/customers/:id', async (m) => {
  const [c, { rows, products, list }, settings] = await Promise.all([q(sb().from('customers').select('*').eq('id', m[1]).maybeSingle(), 'Loading the customer'), orders(), getSettings()]);
  if (!c) throw notFound('Customer not found.');
  const mine = list.filter((o) => o.customer_id === c.id);
  const seen = new Set();
  const addresses = mine.filter((o) => o.shipping_address).map((o) => ({ id: o.id, address: [o.shipping_address, o.shipping_city, o.shipping_state, o.shipping_pincode].filter(Boolean).join(', ') }))
    .filter((a) => !seen.has(a.address) && seen.add(a.address));
  const ids = new Set(mine.map((o) => o.id));
  return { ...customerStats(c, list), addresses, orders: mine,
    custom: customRows(rows.filter((o) => ids.has(o.id)), products, list, settings).map((x) => ({ ...x, created_at: x.order_date })),
    chat: customerChatLink({ customer_name: c.name, phone: c.phone || mine[0]?.phone }, settings) };
});
on('PATCH', '/customers/:id', async (m, _, b) => {
  await q(sb().from('customers').update({ notes: String(b.notes || '').slice(0, 2000) }).eq('id', m[1]), 'Saving the note');
  return { ok: true };
});

/* Custom orders (personalised order items) */
async function customData() {
  const [{ rows, products, list }, settings, assets] = await Promise.all([orders(), getSettings(), q(sb().from('personalization_assets').select('order_item_id,public_url,storage_path'), 'Loading photos')]);
  return customRows(rows, products, list, settings, assets);
}
on('GET', '/custom-orders', async (_, qs) => {
  const f = qs.get('filter') || 'open', t = termOf(qs);
  const all = await customData();
  const open = (c) => c.status !== 'completed' && c.order_status !== 'cancelled';
  const rows = all.filter((c) => (f === 'all' || (f === 'open' ? open(c) : c.status === f))
    && (!t || has(c.number, t) || has(c.customer_name, t) || has(c.phone, t.replace(/\D/g, '') || t) || has(c.product_name, t)));
  const counts = Object.fromEntries([['open', all.filter(open).length], ['all', all.length], ...CUSTOM_STATUSES.map(([k]) => [k, all.filter((c) => c.status === k).length])]);
  return { ...paginate(rows, qs.get('page')), counts };
});
on('GET', '/custom-orders/:id', async (m) => (await customData()).find((c) => c.id === m[1]) || (() => { throw notFound('Custom order not found.'); })());
on('PATCH', '/custom-orders/:id', async (m, _, b) => {
  const admin = await currentAdmin();
  const before = (await customData()).find((c) => c.id === m[1]);
  if (!before) throw notFound('Custom order not found.');
  const patch = { custom_updated_at: new Date().toISOString() };
  if (b.status !== undefined) { if (!CUSTOM_STATUSES.some(([k]) => k === b.status)) throw bad('Customization status is not valid.'); patch.custom_status = b.status; }
  if (b.photo_status !== undefined) { if (!PHOTO_STATUSES.includes(b.photo_status)) throw bad('Photo status is not valid.'); patch.photo_status = b.photo_status; }
  if (b.approval_status !== undefined) { if (!APPROVAL_STATUSES.includes(b.approval_status)) throw bad('Approval status is not valid.'); patch.approval_status = b.approval_status; }
  if (b.admin_notes !== undefined) patch.admin_notes = String(b.admin_notes).slice(0, 2000);
  await q(sb().from('order_items').update(patch).eq('id', before.id), 'Saving the customization');
  if (Array.isArray(b.photos)) {
    if (b.photos.length > 8) throw bad('Up to 8 photos per piece.');
    const keep = b.photos.filter(Boolean);
    const removed = before.photos.filter((u) => !keep.includes(u));
    const added = keep.filter((u) => !before.photos.includes(u));
    if (removed.length) await q(sb().from('personalization_assets').delete().eq('order_item_id', before.id).in('public_url', removed), 'Removing photos');
    if (added.length) await q(sb().from('personalization_assets').insert(added.map((u, i) => ({ order_id: before.order_id, order_item_id: before.id, storage_path: uploadedIds.get(u) || u, public_url: u, original_filename: `whatsapp-photo-${i + 1}` }))), 'Saving photos');
  }
  const nice = (s) => s.replace('design_approved', 'approved').replace(/_/g, ' ');
  if (patch.custom_status && patch.custom_status !== before.status) await addEvent(before.order_id, 'custom', before.status, patch.custom_status, `Customization: ${nice(patch.custom_status).replace(/\b\w/g, (ch) => ch.toUpperCase())}`, admin);
  if (patch.photo_status && patch.photo_status !== before.photo_status) await addEvent(before.order_id, 'custom', before.photo_status, patch.photo_status, `Photo status: ${nice(patch.photo_status)}`, admin);
  if (patch.approval_status && patch.approval_status !== before.approval_status) await addEvent(before.order_id, 'custom', before.approval_status, patch.approval_status, `Design ${nice(patch.approval_status)}`, admin);
  return (await customData()).find((c) => c.id === before.id);
});

/* Inventory */
on('GET', '/inventory', async (_, qs) => {
  const { products, settings } = await catalog();
  const threshold = Number(settings.low_stock_threshold) || 0;
  const all = products.map((p) => {
    const limit = p.low_stock_threshold ?? threshold;
    return { product_id: p.id, product: p.name, image: p.image, threshold: limit, custom_threshold: p.low_stock_threshold, active: p.active, category: p.category_name,
      kind: 'product', id: p.id, sku: p.sku || '', variant: '', stock: p.stock, status: p.stock <= 0 ? 'out_of_stock' : p.stock <= limit ? 'low_stock' : 'in_stock' };
  });
  const f = qs.get('filter') || 'all', t = termOf(qs);
  const rows = all.filter((x) => (f === 'all' || x.status === f) && (!t || has(`${x.product} ${x.sku}`, t)));
  applySort(rows, qs.get('sort'), { stock: (a, b) => a.stock - b.stock, name: (a, b) => a.product.localeCompare(b.product), sku: (a, b) => String(a.sku).localeCompare(String(b.sku)) }, () => 0);
  return { ...paginate(rows, qs.get('page')), threshold, summary: { products: products.length, items: all.length, low: all.filter((x) => x.status === 'low_stock').length,
    out: all.filter((x) => x.status === 'out_of_stock').length, healthy: all.filter((x) => x.status === 'in_stock').length, units: all.reduce((s, x) => s + x.stock, 0) } };
});
on('PATCH', '/inventory', async (_, __, b) => {
  const admin = await currentAdmin();
  const stock = Number(b.stock);
  if (!Number.isInteger(stock) || stock < 0 || stock > 100000) throw bad('Stock must be a whole number between 0 and 100000.');
  const p = await productById(b.id);
  if (!p) throw notFound('Item not found.');
  const patch = { stock_quantity: stock };
  if (p.db_status === 'active' && stock === 0) patch.status = 'out_of_stock';
  if (p.db_status === 'out_of_stock' && stock > 0) patch.status = 'active';
  if (b.threshold !== undefined) patch.low_stock_threshold = b.threshold === '' || b.threshold === null ? 0 : Math.max(0, Number(b.threshold) || 0);
  await q(sb().from('products').update(patch).eq('id', p.id), 'Updating stock');
  await logStock(p.id, p.stock, stock, admin);
  return { ok: true };
});

/* Reviews */
on('GET', '/reviews', async (_, qs) => {
  const f = qs.get('filter') || 'all';
  const rows0 = await q(sb().from('reviews').select('*, product:products(name,main_image,product_images(public_url,position)), customer:customers(name)').order('created_at', { ascending: false }), 'Loading reviews');
  const all = rows0.map((r) => ({ id: r.id, product_id: r.product_id, customer_name: r.customer?.name || 'Customer', rating: r.rating, body: r.review || '',
    status: REVIEW_TO_ADMIN[r.status] || 'pending', featured: r.featured ? 1 : 0, created_at: ts(r.created_at), product_name: r.product?.name || 'Removed product',
    product_image: imageUrl(r.product?.product_images?.slice().sort((a, b) => a.position - b.position)[0]?.public_url || r.product?.main_image) }));
  const rows = all.filter((r) => (f === 'all' ? true : f === 'featured' ? r.featured : r.status === f));
  const approved = all.filter((r) => r.status === 'approved');
  return { ...paginate(rows, qs.get('page')),
    counts: { all: all.length, pending: all.filter((r) => r.status === 'pending').length, approved: approved.length, hidden: all.filter((r) => r.status === 'hidden').length, featured: all.filter((r) => r.featured).length },
    average: approved.length ? Math.round((approved.reduce((s, r) => s + r.rating, 0) / approved.length) * 10) / 10 : 0 };
});
on('PATCH', '/reviews/:id', async (m, _, b) => {
  const r = await q(sb().from('reviews').select('*').eq('id', m[1]).maybeSingle(), 'Loading the review');
  if (!r) throw notFound('Review not found.');
  const status = b.status !== undefined ? b.status : REVIEW_TO_ADMIN[r.status];
  if (!REVIEW_TO_DB[status]) throw bad('Status is not valid.');
  if (b.featured && status !== 'approved') throw bad('Approve the review before featuring it.');
  const featured = status !== 'approved' ? false : b.featured !== undefined ? !!b.featured : r.featured;
  await q(sb().from('reviews').update({ status: REVIEW_TO_DB[status], featured }).eq('id', r.id), 'Updating the review');
  return { ...r, status, featured: featured ? 1 : 0 };
});
on('DELETE', '/reviews/:id', async (m) => { await q(sb().from('reviews').delete().eq('id', m[1]), 'Deleting the review'); return { ok: true }; });

/* Website content, settings, WhatsApp */
on('GET', '/content', () => allContent());
on('PUT', '/content/:key', async (m, _, b) => {
  const key = m[1];
  if (!CONTENT_DEFAULTS[key]) throw notFound('Unknown content section.');
  const current = (await allContent())[key];
  const value = { ...current };
  for (const k of Object.keys(CONTENT_DEFAULTS[key])) if (b[k] !== undefined) value[k] = b[k];
  if (Array.isArray(value.steps) && !value.steps.length) throw bad('Add at least one step.');
  await q(sb().from('site_content').upsert({ key, value, updated_at: new Date().toISOString() }), 'Saving the content');
  return value;
});
on('GET', '/settings', async () => ({ settings: await getSettings(), defaults: { whatsapp_template: SETTING_DEFAULTS.whatsapp_template,
  whatsapp_custom_template: SETTING_DEFAULTS.whatsapp_custom_template, whatsapp_confirm_template: SETTING_DEFAULTS.whatsapp_confirm_template } }));
on('PUT', '/settings', async (_, __, b) => {
  const out = {};
  for (const [k, v] of Object.entries(b)) if (k in SETTING_DEFAULTS) out[k] = typeof v === 'boolean' ? (v ? '1' : '0') : String(v ?? '');
  if ('whatsapp_number' in out) {
    const current = await whatsappFromServer();
    if (out.whatsapp_number.replace(/\D/g, '') !== current) throw bad('The WhatsApp number comes from WHATSAPP_BUSINESS_NUMBER in Vercel (it is the number checkout uses). Change it there and redeploy.');
    delete out.whatsapp_number;
  }
  if (!Object.keys(out).length) return { settings: await getSettings() };
  if ('store_name' in out && !out.store_name.trim()) throw bad('Store name is required.');
  if ('whatsapp_template' in out && !out.whatsapp_template.includes('{{ORDER_ID}}')) throw bad('The order message must include {{ORDER_ID}}.');
  const now = new Date().toISOString();
  await q(sb().from('store_settings').upsert(Object.entries(out).map(([key, value]) => ({ key, value, updated_at: now }))), 'Saving settings');
  return { settings: await getSettings() };
});
on('GET', '/whatsapp', async () => {
  const [settings, { list }, custom] = await Promise.all([getSettings(), orders(), customData()]);
  const waitingCustom = new Set(custom.filter((c) => ['waiting_for_customer', 'photos_pending'].includes(c.status)).map((c) => c.order_id));
  const waiting = list.filter((o) => !['delivered', 'cancelled'].includes(o.status) && (o.payment_status !== 'confirmed' || waitingCustom.has(o.id)))
    .map((o) => ({ ...o, chat: customerChatLink(o, settings) }));
  const sample = { number: 'FH-0000', customer_name: 'Customer Name', phone: '+91 00000 00000', total: 0,
    items: [{ product_name: 'Product name', variant_name: '', quantity: 1, customization: 'Customization details; Photo/details to be shared on WhatsApp' }] };
  return { number: settings.whatsapp_number, env_number: settings.whatsapp_number, waiting,
    previews: { order: fillTemplate(settings.whatsapp_template, sample, settings), custom: fillTemplate(settings.whatsapp_custom_template, sample, settings),
      confirm: fillTemplate(settings.whatsapp_confirm_template, sample, settings) } };
});

/* ======================================================================
   Uploads
   ====================================================================== */
const uploadedIds = new Map();   // Cloudinary url → public id, for photos saved in this session
/**
 * Product, category and site images go to Supabase Storage (bucket product-images), as before.
 * Customer photos for personalised items go to Cloudinary through /api/admin/upload-photo.
 */
export async function upload(file, kind, onProgress) {
  const admin = await currentAdmin();
  if (kind === 'customer_photo') {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error(`${file.name}: photos must be JPG, PNG or WebP.`);
    if (file.size > 3 * 1024 * 1024) throw new Error(`${file.name} is larger than 3 MB. Please use a smaller photo.`);
    const itemId = location.pathname.split('/').pop();
    const item = await q(sb().from('order_items').select('id,order_id').eq('id', itemId).maybeSingle(), 'Finding the order');
    if (!item) throw new Error('Open the personalised item first, then add photos.');
    onProgress?.(20);
    const data = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.onerror = reject; r.readAsDataURL(file); });
    onProgress?.(50);
    const res = await fetch('/api/admin/upload-photo', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` },
      body: JSON.stringify({ order_id: item.order_id, order_item_id: item.id, content_type: file.type, filename: file.name, data }) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out.url) throw new Error(`${file.name}: ${out.error || 'the upload failed. Please try again.'}`);
    onProgress?.(100);
    uploadedIds.set(out.url, out.public_id);
    return { url: out.url, public_id: out.public_id };
  }
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error(`${file.name}: please choose a JPG, PNG or WebP image.`);
  const folder = { product: 'products', category: 'categories', logo: 'site', content: 'site' }[kind] || 'uploads';
  const path = `${folder}/${crypto.randomUUID()}.${(file.name.split('.').pop() || 'jpg').toLowerCase()}`;
  onProgress?.(30);
  const { error } = await sb().storage.from(IMAGE_BUCKET).upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw new Error(`${file.name}: ${error.message}`);
  onProgress?.(100);
  return { url: storageUrl(path), public_id: path };
}

/* ======================================================================
   Entry point
   ====================================================================== */
/** Answers one admin API request. Throws AdminDataError (with `status`) for anything that can't be done. */
export async function supabaseApi(method, path, body) {
  const url = new URL(path, 'http://admin');
  const route = R.find(([m, re]) => m === method && re.test(url.pathname));
  if (!route) throw notFound('Not found.');
  await currentAdmin();   // every request: signed in, and an admin
  return route[2](route[1].exec(url.pathname), url.searchParams, body ?? {});
}
