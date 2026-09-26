/**
 * Forever Handy admin — app shell: API client, router, navigation, global search,
 * toasts, confirm dialogs and shared UI helpers. Pages live in ./pages/*.js and
 * are loaded on demand. Every request is authorised again by the server.
 */

import { esc, icon, debounce, inr } from './lib.js';
import { supabaseApi, upload as uploadToStore } from './data/supabase-api.js';
import { toast, confirmBox, emptyState, errorState, loadingRows, nextSort } from './components.js';
export * from './lib.js';
export * from './components.js';

/* ======================================================================
   API
   ====================================================================== */
export class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
export async function api(method, path, body) {
  try { return await supabaseApi(method, path, body); }
  catch (err) {
    // Not signed in, or not an admin: back to sign-in (the database would refuse anyway).
    if (err.status === 401 || err.status === 403) {
      location.assign(`/admin/login?next=${encodeURIComponent(location.pathname)}${err.status === 403 ? '&denied=1' : ''}`);
      throw new ApiError(err.status, err.message);
    }
    if (!err.status) console.error(err);
    throw new ApiError(err.status || 500, err.status ? err.message : 'Something went wrong. Please try again.');
  }
}
/**
 * Uploads one image and resolves with { url, public_id }. Product, category and site images go to
 * Supabase Storage; customer photos for personalised items go to Cloudinary (see data/supabase-api.js).
 * kind: product | category | logo | content | customer_photo. onProgress(0–100) is optional.
 */
export const uploadImage = async (file, kind = 'product', onProgress = null) => {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error(`${file.name}: please choose a JPG, PNG or WebP image.`);
  if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is larger than 10 MB. Please use a smaller image.`);
  try { return await uploadToStore(file, kind, onProgress); }
  catch (err) { throw err instanceof ApiError ? err : new ApiError(err.status || 0, err.message); }
};
/** An ImageUploader `upload` function for a given kind of image. */
export const uploaderFor = (kind) => (file, onProgress) => uploadImage(file, kind, onProgress);

let metaCache = null;
export async function meta(refresh = false) {
  if (!metaCache || refresh) metaCache = await api('GET', '/meta');
  return metaCache;
}

/** Reads/writes the page's query string without reloading. */
export function setQuery(params) {
  const url = new URL(location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v === '' || v === null || v === undefined || (k === 'page' && Number(v) === 1)) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  history.replaceState(history.state, '', url);
}

/**
 * Shared behaviour for list pages: search box [data-q], filter chips [data-filter],
 * selects [data-select=name], sortable headers [data-sort], pagination [data-page]
 * and retry [data-retry]. `render(state)` fills `target` and may throw (shows an error state).
 */
export function listController({ view, target, state, render }) {
  let seq = 0;
  const load = async () => {
    const id = ++seq;
    setQuery(state);
    target.classList.add('is-loading');
    try {
      const html = await render(state);
      if (id === seq) target.innerHTML = html;
    } catch (err) {
      if (id === seq) target.innerHTML = errorState(err);
    }
    if (id === seq) target.classList.remove('is-loading');
  };
  view.querySelector('[data-q]')?.addEventListener('input', debounce((e) => { state.q = e.target.value.trim(); state.page = 1; load(); }, 280));
  view.addEventListener('change', (e) => {
    const s = e.target.closest('[data-select]');
    if (s) { state[s.dataset.select] = s.value; state.page = 1; load(); }
  });
  view.addEventListener('click', (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) {
      state.filter = f.dataset.filter; state.page = 1;
      view.querySelectorAll('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b === f)));
      return load();
    }
    const s = e.target.closest('[data-sort]');
    if (s) { state.sort = nextSort(state.sort, s.dataset.sort); state.page = 1; return load(); }
    const p = e.target.closest('[data-page]');
    if (p && !p.disabled) { state.page = Number(p.dataset.page); load(); target.scrollIntoView({ block: 'nearest' }); return; }
    if (e.target.closest('[data-retry]')) load();
  });
  return { load };
}

/* ======================================================================
   Navigation
   ====================================================================== */
const NAV = [
  ['dashboard', 'Dashboard', 'dashboard'],
  ['group', 'Store Management'],
  ['products', 'Products', 'products'],
  ['categories', 'Categories', 'categories'],
  ['orders', 'Orders', 'orders', 'orders'],
  ['custom-orders', 'Custom Orders', 'custom', 'custom_orders'],
  ['customers', 'Customers', 'customers'],
  ['inventory', 'Inventory', 'inventory', 'inventory'],
  ['group', 'Content'],
  ['content', 'Website Content', 'content'],
  ['reviews', 'Reviews', 'reviews', 'reviews'],
  ['group', 'Settings'],
  ['whatsapp', 'WhatsApp', 'whatsapp', 'whatsapp'],
  ['settings', 'Settings', 'settings'],
];
const navEl = document.querySelector('[data-nav]');
navEl.innerHTML = NAV.map(([key, label, ic, badge]) => (key === 'group'
  ? `<p class="nav__group">${label}</p>`
  : `<a class="nav__item" href="/admin/${key}" data-link data-nav-key="${key}">${icon(ic)}<span>${label}</span>${badge ? `<span class="nav__badge" data-badge="${badge}" hidden></span>` : ''}</a>`)).join('');

export async function refreshBadges() {
  try {
    const me = await api('GET', '/me');
    for (const [k, n] of Object.entries(me.badges)) {
      const el = navEl.querySelector(`[data-badge="${k}"]`);
      if (el) { el.textContent = n; el.hidden = !n; }
    }
    const bell = document.querySelector('[data-bell-count]');
    bell.textContent = me.badges.orders; bell.hidden = !me.badges.orders;
    document.querySelectorAll('[data-admin-name]').forEach((e) => { e.textContent = me.admin.name; });
    document.querySelectorAll('[data-admin-email]').forEach((e) => { e.textContent = me.admin.email; });
    document.querySelectorAll('[data-avatar]').forEach((e) => { e.textContent = (me.admin.name || 'F').trim()[0].toUpperCase(); });
  
    return me;
  } catch { return null; }
}

/* ---------- Mobile drawer ---------- */
const sidebar = document.querySelector('[data-sidebar]');
const scrim = document.querySelector('[data-scrim]');
const menuBtn = document.querySelector('[data-menu]');
const setDrawer = (open) => {
  sidebar.classList.toggle('is-open', open);
  scrim.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
  if (open) sidebar.querySelector('.nav__item')?.focus();
};
menuBtn.addEventListener('click', () => setDrawer(!sidebar.classList.contains('is-open')));
scrim.addEventListener('click', () => setDrawer(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sidebar.classList.contains('is-open')) { setDrawer(false); menuBtn.focus(); } });

document.querySelector('[data-logout]').addEventListener('click', async () => {
  try { await api('POST', '/logout'); } catch { /* signing out anyway */ }
  location.assign('/admin/login');
});

/* ======================================================================
   Router
   ====================================================================== */
const ROUTES = [
  [/^\/admin\/dashboard$/, 'dashboard', 'dashboard'],
  [/^\/admin\/products$/, 'products', 'products'],
  [/^\/admin\/products\/(new|[\w-]+)$/, 'product-form', 'products'],
  [/^\/admin\/categories$/, 'categories', 'categories'],
  [/^\/admin\/orders$/, 'orders', 'orders'],
  [/^\/admin\/orders\/new$/, 'order-new', 'orders'],
  [/^\/admin\/orders\/([\w-]+)$/, 'order-detail', 'orders'],
  [/^\/admin\/customers$/, 'customers', 'customers'],
  [/^\/admin\/customers\/([\w-]+)$/, 'customer-detail', 'customers'],
  [/^\/admin\/custom-orders$/, 'custom-orders', 'custom-orders'],
  [/^\/admin\/custom-orders\/([\w-]+)$/, 'custom-order-detail', 'custom-orders'],
  [/^\/admin\/inventory$/, 'inventory', 'inventory'],
  [/^\/admin\/reviews$/, 'reviews', 'reviews'],
  [/^\/admin\/content$/, 'content', 'content'],
  [/^\/admin\/whatsapp$/, 'whatsapp', 'whatsapp'],
  [/^\/admin\/settings$/, 'settings', 'settings'],
];
let view = document.querySelector('[data-view]');
let cleanup = null;
let dirty = false;
let renderId = 0;
export const setDirty = (v) => { dirty = v; };
window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

export async function navigate(url, { replace = false } = {}) {
  if (dirty && !(await confirmBox({ title: 'Discard changes?', message: 'You have unsaved changes on this page.', confirm: 'Discard', danger: true }))) return;
  dirty = false;
  if (replace) history.replaceState(null, '', url); else history.pushState(null, '', url);
  route();
}

async function route() {
  const id = ++renderId;
  if (/^\/admin\/?$/.test(location.pathname)) history.replaceState(null, '', '/admin/dashboard');   // /admin opens the dashboard
  const path = location.pathname.replace(/\/$/, '');
  const match = ROUTES.map(([re, page, nav]) => ({ m: re.exec(path), page, nav })).find((r) => r.m);
  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* ignore */ } }
  cleanup = null;
  setDrawer(false);
  // a fresh container per page, so no event listeners leak from the previous page
  const fresh = view.cloneNode(false);
  view.replaceWith(fresh);
  view = fresh;
  navEl.querySelectorAll('.nav__item').forEach((a) => a.toggleAttribute('aria-current', !!match && a.dataset.navKey === match.nav));
  navEl.querySelectorAll('.nav__item[aria-current]').forEach((a) => a.setAttribute('aria-current', 'page'));
  if (!match) { view.innerHTML = emptyState('Page not found', 'That admin page does not exist.', '<a class="btn btn--ghost" href="/admin/dashboard" data-link>Go to dashboard</a>'); return; }
  view.innerHTML = `<div class="skeleton" style="height:40px;width:260px;margin-bottom:24px"></div>${loadingRows(6)}`;
  try {
    const mod = await import(`./pages/${match.page}.js`);
    if (id !== renderId) return;
    view.scrollTop = 0;
    window.scrollTo(0, 0);
    cleanup = await mod.default({ view, params: match.m.slice(1), query: new URL(location.href).searchParams });
    document.title = `${view.querySelector('h1')?.textContent?.trim() || 'Admin'} · Forever Handy Admin`;
    view.focus({ preventScroll: true });
  } catch (err) {
    if (id !== renderId) return;
    console.error(err);
    view.innerHTML = errorState(err);
    view.querySelector('[data-retry]')?.addEventListener('click', route);
  }
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a || a.target === '_blank' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith('/admin/') || url.pathname === '/admin/login') return;
  e.preventDefault();
  if (url.pathname === location.pathname && url.search === location.search) { if (url.hash) document.getElementById(url.hash.slice(1))?.scrollIntoView(); return; }
  navigate(url.pathname + url.search + url.hash);
});
// clickable table rows
document.addEventListener('click', (e) => {
  const row = e.target.closest('tr[data-href]');
  if (!row || e.target.closest('a, button, input, select, label')) return;
  navigate(row.dataset.href);
});
window.addEventListener('popstate', () => { dirty = false; route(); });

/* ======================================================================
   Global search
   ====================================================================== */
const searchInput = document.querySelector('[data-search]');
const searchBox = document.querySelector('[data-search-results]');
const runSearch = debounce(async () => {
  const q = searchInput.value.trim();
  if (q.length < 2) { searchBox.hidden = true; return; }
  try {
    const r = await api('GET', `/search?q=${encodeURIComponent(q)}`);
    const group = (title, rows, fn) => (rows.length ? `<p class="search__group">${title}</p>${rows.map(fn).join('')}` : '');
    const html = group('Orders', r.orders, (o) => `<a class="search__item" href="/admin/orders/${o.id}">${esc(o.number)} · ${esc(o.customer_name)}<small>${inr(o.total)}</small></a>`)
      + group('Products', r.products, (p) => `<a class="search__item" href="/admin/products/${p.id}">${esc(p.name)}<small>${esc(p.sku || '')}</small></a>`)
      + group('Customers', r.customers, (c) => `<a class="search__item" href="/admin/customers/${c.id}">${esc(c.name)}<small>${esc(c.phone)}</small></a>`);
    searchBox.innerHTML = html || '<p class="search__empty">No matches.</p>';
    searchBox.hidden = false;
  } catch (err) { searchBox.innerHTML = `<p class="search__empty">${esc(err.message)}</p>`; searchBox.hidden = false; }
}, 250);
searchInput.addEventListener('input', runSearch);
searchInput.addEventListener('focus', () => { if (searchInput.value.trim().length >= 2) runSearch(); });
searchInput.addEventListener('keydown', (e) => {
  const items = [...searchBox.querySelectorAll('.search__item')];
  if (!items.length) return;
  const i = items.findIndex((x) => x.classList.contains('is-active'));
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items.forEach((x, k) => x.classList.toggle('is-active', k === next));
  } else if (e.key === 'Enter' && i >= 0) { e.preventDefault(); items[i].click(); }
  else if (e.key === 'Escape') searchBox.hidden = true;
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search')) searchBox.hidden = true;
  else if (e.target.closest('.search__item')) { searchBox.hidden = true; searchInput.value = ''; }
});

/* ---------- WhatsApp chats open in a new tab (or the WhatsApp app on phones) ---------- */
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="https://wa.me/"]');
  if (!a || e.defaultPrevented) return;
  e.preventDefault();
  window.open(a.href, '_blank', 'noopener');
});

/* ---------- Appearance preferences (Settings → Appearance) ---------- */
export function applyAppearance(s) {
  document.body.classList.toggle('density-compact', s.appearance_density === 'compact');
  document.body.classList.toggle('no-sidebar-art', s.appearance_sidebar_art === '0');
  document.body.classList.toggle('reduce-motion', s.appearance_reduce_motion === '1');
}

/* ---------- Boot ---------- */
api('GET', '/settings').then((d) => applyAppearance(d.settings)).catch(() => {});
refreshBadges();
setInterval(refreshBadges, 60_000);
route();
