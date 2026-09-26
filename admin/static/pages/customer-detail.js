import { api, meta, esc, inr, fmtDate, icon, pill, PageHeader, StatCard, Avatar, emptyState, errorState, toast, toastError } from '../app.js';
import { orderTable } from './orders.js';

export default async function customerDetail({ view, params }) {
  const m = await meta();
  const labels = Object.fromEntries(m.order_statuses);
  const customLabels = Object.fromEntries(m.custom_statuses);
  let c;
  try { c = await api('GET', `/customers/${encodeURIComponent(params[0])}`); }
  catch (err) { view.innerHTML = errorState(err); return; }
  const live = c.orders.filter((o) => o.status !== 'cancelled');
  const avg = live.length ? Math.round(c.total_spent / Math.max(1, c.orders.filter((o) => o.payment_status === 'confirmed').length)) : 0;

  view.innerHTML = `
    ${PageHeader({ crumb: { href: '/admin/customers', label: 'Customers' }, title: esc(c.name),
      text: `Customer since ${fmtDate(c.created_at)}${c.city ? ` · ${esc(c.city)}` : ''}`,
      actions: `<a class="btn btn--ghost" href="/admin/orders/new">${icon('plus')} New order</a><a class="btn btn--wa" href="${esc(c.chat)}" data-wa-name="${esc(c.name)}">${icon('whatsapp')} WhatsApp</a>` })}
    <section class="stats stats--4">
      ${StatCard({ label: 'Orders', value: live.length, icon: 'orders' })}
      ${StatCard({ label: 'Total spent', value: inr(c.total_spent), icon: 'rupee', tone: 'gold' })}
      ${StatCard({ label: 'Average order', value: inr(avg), icon: 'activity' })}
      ${StatCard({ label: 'Custom orders', value: c.custom.length, icon: 'custom' })}
    </section>
    <div class="form-grid">
      <div class="stack">
        <section class="card"><div class="card__head"><h2 class="section-title" style="margin:0">Order history</h2></div>
          ${c.orders.length ? orderTable(c.orders, labels, { customer: false }) : emptyState('No orders yet', '', '', 'orders')}</section>
        <section class="card"><h2 class="section-title">Custom orders</h2>
          ${c.custom.length ? `<ul class="list">${c.custom.map((x) => `<li><img class="thumb thumb--lg" src="${esc(x.image_url)}" alt="">
            <a class="list__main" href="/admin/custom-orders/${x.id}"><strong>${esc(x.product_name)}</strong><small>${esc(x.number)} · ${fmtDate(x.created_at)}</small></a>${pill(x.status, customLabels[x.status])}</li>`).join('')}</ul>`
            : '<p class="muted" style="margin:0">No personalised pieces yet.</p>'}</section>
      </div>
      <aside class="stack">
        <section class="card profile">
          ${Avatar(c.name, 72)}
          <h2 class="profile__name">${esc(c.name)}</h2>
          <p class="muted">${c.order_count > 1 ? 'Repeat customer' : 'First-time customer'}</p>
        </section>
        <section class="card"><h2 class="section-title">Contact</h2>
          <ul class="contact-list">
            <li>${icon('phone')} <a href="tel:${esc(c.phone.replace(/\s/g, ''))}">${esc(c.phone)}</a></li>
            <li>${icon('mail')} ${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '<span class="muted">No email</span>'}</li>
            <li>${icon('whatsapp')} <a href="${esc(c.chat)}" data-wa-name="${esc(c.name)}">Message on WhatsApp</a></li>
          </ul></section>
        <section class="card"><h2 class="section-title">Addresses</h2>
          ${c.addresses.length ? `<ul class="list">${c.addresses.map((a, i) => `<li><span class="list__main"><span style="white-space:normal">${icon('pin', 'inline-icon')} ${esc(a.address)}</span><small>${i === 0 ? 'Most recent · ' : ''}Used ${fmtDate(a.created_at)}</small></span></li>`).join('')}</ul>`
            : '<p class="muted" style="margin:0">No address on file yet.</p>'}</section>
        <section class="card"><form class="fields" data-notes>
          <div class="field"><label for="notes" class="section-title" style="margin:0">Notes</label><textarea id="notes" name="notes" rows="4" maxlength="2000" placeholder="Preferences, sizes, special occasions…">${esc(c.notes)}</textarea></div>
          <div><button class="btn btn--ghost btn--sm" type="submit">Save notes</button></div></form></section>
      </aside>
    </div>`;
  view.querySelector('[data-notes]').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('PATCH', `/customers/${c.id}`, { notes: e.target.notes.value }); toast('Notes saved.'); } catch (err) { toastError(err); }
  });
}
