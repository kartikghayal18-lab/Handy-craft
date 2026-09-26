import { api, esc, icon, PageHeader, ImageUploader, uploadImage, toast, toastError, errorState, setDirty, setQuery, refreshBadges, confirmBox, applyAppearance, uploaderFor } from '../app.js';

const SECTIONS = [['store', 'Store Information', 'store'], ['contact', 'Contact', 'phone'], ['social', 'Social Links', 'link'], ['orders', 'Order Settings', 'orders'],
  ['shipping', 'Shipping', 'truck'], ['notifications', 'Notifications', 'bell'], ['appearance', 'Appearance', 'palette'], ['account', 'Account', 'customers']];

export default async function settings({ view, query }) {
  let s, me;
  try { [{ settings: s }, me] = await Promise.all([api('GET', '/settings'), api('GET', '/me')]); }
  catch (err) { view.innerHTML = errorState(err); return; }
  let tab = SECTIONS.some(([k]) => k === (query.get('tab') || location.hash.slice(1))) ? (query.get('tab') || location.hash.slice(1)) : 'store';
  let logo = s.logo_url ? [{ url: s.logo_url, alt: '' }] : [];
  let dirty = false;
  const markDirty = (on = true) => { dirty = on; setDirty(on); const x = view.querySelector('[data-status]'); if (x) x.textContent = on ? 'Unsaved changes' : 'All changes saved'; };

  const input = (name, label, attrs = '', hint = '') => `<div class="field"><label for="s-${name}">${label}</label><input id="s-${name}" name="${name}" value="${esc(s[name])}" ${attrs}>${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
  const toggle = (name, label, hint = '') => `<label class="switch switch--row"><span>${label}${hint ? `<br><small class="muted">${hint}</small>` : ''}</span><input type="checkbox" name="${name}"${s[name] === '1' ? ' checked' : ''}></label>`;
  const save = '<div class="cms__save"><span class="muted" data-status>All changes saved</span><button class="btn btn--primary" type="submit" data-save>Save changes</button></div>';

  view.innerHTML = `
    ${PageHeader({ title: 'Settings', text: 'Store details, orders, shipping, notifications and how the admin looks.' })}
    <div class="cms">
      <nav class="cms__nav" aria-label="Settings sections">${SECTIONS.map(([k, l, ic]) => `<button type="button" class="cms__tab" data-tab="${k}" aria-current="${k === tab}">${icon(ic)}<span>${l}</span></button>`).join('')}</nav>
      <section class="card cms__panel" data-panel></section>
    </div>`;
  const panel = view.querySelector('[data-panel]');

  const render = () => {
    setQuery({ tab });
    markDirty(false);
    view.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.tab === tab)));
    const forms = {
      store: `<h2 class="section-title">Store Information</h2>
        ${input('store_name', 'Store name', 'required maxlength="80"')}
        ${input('tagline', 'Tagline', 'maxlength="120"')}
        <div class="field"><span class="label">Logo <span>optional, square works best</span></span><div data-logo></div></div>
        <div class="field"><label for="s-address">Business address</label><textarea id="s-address" name="address" rows="2" maxlength="300">${esc(s.address)}</textarea></div>
        ${input('gstin', 'GSTIN <span>optional</span>', 'maxlength="15" placeholder="e.g. 27ABCDE1234F1Z5"')}`,
      contact: `<h2 class="section-title">Contact</h2>
        <div class="fields-2">${input('email', 'Email', 'type="email" maxlength="160"', 'Shown in the footer and on invoices.')}${input('phone', 'Phone', 'type="tel" maxlength="20"')}</div>
        <div class="field"><span class="label">WhatsApp number</span><p style="margin:0">+${esc(s.whatsapp_number || '—')} · <a class="link" href="/admin/whatsapp">Change on the WhatsApp page</a></p></div>`,
      social: `<h2 class="section-title">Social Links</h2>
        <p class="muted" style="margin:-6px 0 0">Shown as links in the storefront footer. Leave empty to hide.</p>
        ${input('instagram', 'Instagram', 'type="url" maxlength="300" placeholder="https://instagram.com/…"')}
        ${input('facebook', 'Facebook', 'type="url" maxlength="300" placeholder="https://facebook.com/…"')}
        ${input('pinterest', 'Pinterest', 'type="url" maxlength="300" placeholder="https://pinterest.com/…"')}
        ${input('youtube', 'YouTube', 'type="url" maxlength="300" placeholder="https://youtube.com/@…"')}`,
      orders: `<h2 class="section-title">Order Settings</h2>
        <div class="fields-2">${input('order_prefix', 'Order ID prefix', 'maxlength="8"', `Next order looks like <strong data-prefix-preview>${esc(s.order_prefix)}1057</strong>`)}
          ${input('max_quantity', 'Max quantity per item', 'type="number" min="1" max="99" step="1"')}</div>
        <div class="fields-2">${input('low_stock_threshold', 'Low stock alert at', 'type="number" min="0" max="10000" step="1"', 'Products at or below this count are flagged.')}
          ${input('production_time', 'Default production time', 'maxlength="80"', 'Used when a product doesn’t set its own.')}</div>
        ${toggle('allow_backorders', 'Allow orders when out of stock', 'Customers can still order sold-out pieces; they’re made to order.')}`,
      shipping: `<h2 class="section-title">Shipping</h2>
        <div class="fields-2">${input('shipping_flat', 'Flat shipping fee (₹)', 'type="number" min="0" step="1"')}
          ${input('free_shipping_above', 'Free shipping above (₹)', 'type="number" min="0" step="1"', 'Set 0 to always charge the flat fee.')}</div>
        <div class="fields-2">${input('delivery_time', 'Delivery time', 'maxlength="80"')}${input('ship_regions', 'Ships to', 'maxlength="120"')}</div>
        ${toggle('cod', 'Cash on delivery', 'Let customers pay when the order arrives.')}`,
      notifications: `<h2 class="section-title">Notifications</h2>
        ${input('notify_email', 'Send notifications to', 'type="email" maxlength="160"')}
        <div class="switch-list">
          ${toggle('notify_new_order', 'New orders', 'An email for every new order.')}
          ${toggle('notify_low_stock', 'Low stock alerts', 'When a product reaches the alert level.')}
          ${toggle('notify_reviews', 'New reviews', 'When a customer leaves a review to approve.')}
          ${toggle('notify_daily_summary', 'Daily summary', 'One email each evening with the day’s orders and revenue.')}
        </div>`,
      appearance: `<h2 class="section-title">Appearance</h2>
        <fieldset class="field radio-cards"><legend class="label">Density</legend>
          <label class="radio-card"><input type="radio" name="appearance_density" value="comfortable"${s.appearance_density !== 'compact' ? ' checked' : ''}><span><strong>Comfortable</strong><small>More breathing room</small></span></label>
          <label class="radio-card"><input type="radio" name="appearance_density" value="compact"${s.appearance_density === 'compact' ? ' checked' : ''}><span><strong>Compact</strong><small>More rows on screen</small></span></label>
        </fieldset>
        <div class="switch-list">
          ${toggle('appearance_sidebar_art', 'Sidebar artwork', 'The feather and “Preserving Your Precious Moments” note.')}
          ${toggle('appearance_reduce_motion', 'Reduce motion', 'Turn off loading shimmer and transitions.')}
        </div>`,
      account: `<h2 class="section-title">Account</h2>
        <div class="profile-row">${`<span class="avatar" style="width:56px;height:56px;font-size:26px">${esc((me.admin.name || 'S')[0])}</span>`}<div><strong>${esc(me.admin.name)}</strong><br><small class="muted">${esc(me.admin.email)}</small></div></div>
        <div class="fields-2"><div class="field"><label for="a-name">Display name</label><input id="a-name" name="admin_name" value="${esc(me.admin.name)}" maxlength="60" required></div>
          <div class="field"><label for="a-email">Email</label><input id="a-email" value="${esc(me.admin.email)}" disabled></div></div>
        <h3 class="subhead">Change password</h3>
        <div class="fields-2"><div class="field"><label for="p-cur">Current password</label><input id="p-cur" name="current" type="password" autocomplete="current-password"></div>
          <div class="field"><label for="p-new">New password</label><input id="p-new" name="next" type="password" autocomplete="new-password" minlength="10"><span class="hint">At least 10 characters. Other devices are signed out.</span></div></div>`,
    };
    panel.innerHTML = `<form class="fields" data-form novalidate>${forms[tab]}${save}</form>`;
    if (tab === 'store') ImageUploader(panel.querySelector('[data-logo]'), { images: logo, single: true, upload: uploaderFor('logo'), altText: false, onChange: (l) => { logo = l; markDirty(); } });
  };

  view.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.matches('[data-tab]') && t.dataset.tab !== tab) {
      if (dirty && !(await confirmBox({ title: 'Discard changes?', message: 'You have unsaved changes in this section.', confirm: 'Discard', danger: true }))) return;
      tab = t.dataset.tab; render();
    }
  });
  view.addEventListener('input', (e) => {
    if (!e.target.closest('[data-form]')) return;
    markDirty();
    if (e.target.name === 'order_prefix') view.querySelector('[data-prefix-preview]').textContent = `${e.target.value.toUpperCase()}1057`;
  });
  view.addEventListener('change', (e) => { if (e.target.closest('[data-form]')) markDirty(); });
  view.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-form]');
    if (!f) return;
    e.preventDefault();
    if (!f.reportValidity()) return;
    const btn = f.querySelector('[data-save]');
    btn.disabled = true;
    try {
      if (tab === 'account') {
        await api('PUT', '/profile', { name: f.admin_name.value });
        if (f.next.value) {
          await api('POST', '/password', { current: f.current.value, next: f.next.value });
          f.current.value = ''; f.next.value = '';
          toast('Password changed.');
        }
        me = await api('GET', '/me'); refreshBadges();
        toast('Account updated.');
      } else {
        const body = {};
        for (const el of f.elements) {
          if (!el.name || el.disabled) continue;
          if (el.type === 'checkbox') body[el.name] = el.checked ? '1' : '0';
          else if (el.type === 'radio') { if (el.checked) body[el.name] = el.value; }
          else body[el.name] = el.value;
        }
        if (tab === 'store') body.logo_url = logo[0]?.url || '';
        s = (await api('PUT', '/settings', body)).settings;
        if (tab === 'appearance') applyAppearance(s);
        if (tab === 'orders') f.order_prefix.value = s.order_prefix;
        toast(`${SECTIONS.find(([k]) => k === tab)[1]} saved.`);
      }
      markDirty(false);
    } catch (err) { toastError(err); }
    btn.disabled = false;
  });
  render();
  return () => setDirty(false);
}
