import { api, meta, esc, fmtDateTime, fmtDate, icon, pill, labelize, PageHeader, OrderTimeline, Avatar, ImageUploader, uploaderFor, toast, toastError, errorState, refreshBadges, navigate } from '../app.js';

export default async function customOrderDetail({ view, params }) {
  const m = await meta();
  const labels = Object.fromEntries(m.custom_statuses);
  let c, settings;
  try { [c, { settings }] = await Promise.all([api('GET', `/custom-orders/${encodeURIComponent(params[0])}`), api('GET', '/settings')]); }
  catch (err) { view.innerHTML = errorState(err); return; }
  const idx = m.custom_statuses.findIndex(([k]) => k === c.status);
  const next = m.custom_statuses[idx + 1];
  const message = String(settings.whatsapp_custom_template || '').replaceAll('{{CUSTOMER_NAME}}', c.customer_name.split(' ')[0]).replaceAll('{{ORDER_ID}}', c.number)
    .replaceAll('{{STORE_NAME}}', settings.store_name).replaceAll('{{PRODUCT}}', c.product_name);

  view.innerHTML = `
    ${PageHeader({ crumb: { href: '/admin/custom-orders', label: 'Custom Orders' }, title: esc(c.product_name),
      text: `Order <a class="link" href="/admin/orders/${c.order_id}">${esc(c.number)}</a> · ${fmtDate(c.order_date)} · ${pill(c.status, labels[c.status])}`,
      actions: `<a class="btn btn--ghost" href="/admin/orders/${c.order_id}">${icon('orders')} View order</a><a class="btn btn--wa" href="${esc(c.chat)}" data-wa-name="${esc(c.customer_name)}">${icon('whatsapp')} Open WhatsApp</a>` })}
    ${next && c.order_status !== 'cancelled' ? `<div class="next-step card"><span class="next-step__text">${icon('info')} Next step: <strong>${esc(next[1])}</strong></span>
      <button class="btn btn--primary" type="button" data-next="${next[0]}">Mark as ${esc(next[1])} ${icon('arrow')}</button></div>` : ''}
    <div class="form-grid">
      <div class="stack">
        <section class="card">
          <h2 class="section-title">Customer request</h2>
          <div class="cell-product" style="margin-bottom:14px"><img class="thumb thumb--xl" src="${esc(c.image_url)}" alt=""><span><strong>${esc(c.product_name)}</strong><br><small class="muted">${esc(c.variant_name || 'Standard')} · Qty ${c.quantity}</small></span></div>
          <blockquote class="request">${esc(c.customer_instructions || 'No written request. Details to be confirmed on WhatsApp.')}</blockquote>
          <h3 class="subhead">Customization requirements</h3>
          <p style="margin:0">${esc(c.requirements || 'No special requirements for this product.')}</p>
        </section>
        <section class="card">
          <div class="card__head"><h2 class="section-title" style="margin:0">Photos</h2>${pill(c.photo_status === 'pending' ? 'photos_pending' : c.photo_status, labelize(c.photo_status))}</div>
          <p class="muted" style="margin:0 0 12px">Photos the customer shared on WhatsApp. Add them here to keep everything with the order.</p>
          <div data-photos></div>
        </section>
        <section class="card">
          <h2 class="section-title">WhatsApp message</h2>
          <pre class="wa-bubble">${esc(message)}</pre>
          <div class="btn-row"><button class="btn btn--ghost btn--sm" type="button" data-copy>${icon('copy')} Copy message</button><a class="btn btn--wa btn--sm" href="${esc(c.chat)}" data-wa-name="${esc(c.customer_name)}">${icon('whatsapp')} Send on WhatsApp</a></div>
        </section>
      </div>
      <aside class="stack">
        <section class="card">
          <h2 class="section-title">Status</h2>
          ${OrderTimeline(m.custom_statuses.map(([k, l], i) => ({ label: l, state: i < idx ? 'done' : i === idx ? 'current' : 'todo', time: i === idx ? `Updated ${fmtDateTime(c.updated_at)}` : '' })))}
        </section>
        <section class="card">
          <form class="fields" data-form>
            <h2 class="section-title">Update</h2>
            <div class="field"><label for="s">Customization status</label><select id="s" name="status">${m.custom_statuses.map(([k, l]) => `<option value="${k}"${k === c.status ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
            <div class="field"><label for="p">Photo status</label><select id="p" name="photo_status">${m.photo_statuses.map((k) => `<option value="${k}"${k === c.photo_status ? ' selected' : ''}>${labelize(k)}</option>`).join('')}</select></div>
            <div class="field"><label for="a">Design approval</label><select id="a" name="approval_status">${m.approval_statuses.map((k) => `<option value="${k}"${k === c.approval_status ? ' selected' : ''}>${labelize(k)}</option>`).join('')}</select></div>
            <div class="field"><label for="n">Admin notes</label><textarea id="n" name="admin_notes" rows="5" maxlength="2000" placeholder="What was agreed on WhatsApp">${esc(c.admin_notes)}</textarea></div>
            <button class="btn btn--primary" type="submit">Save changes</button>
          </form>
        </section>
        <section class="card"><h2 class="section-title">Customer</h2>
          <div class="person">${Avatar(c.customer_name, 44)}<div><a class="link" href="/admin/customers/${c.customer_id}"><strong>${esc(c.customer_name)}</strong></a><br><small class="muted">${esc(c.phone)}</small></div></div>
        </section>
      </aside>
    </div>`;

  let photos = (c.photos || []).map((url) => ({ url, alt: '' }));
  ImageUploader(view.querySelector('[data-photos]'), {
    images: photos, max: 8, primary: false, upload: uploaderFor('customer_photo'), altText: false, hint: 'Photos the customer sent on WhatsApp',
    onChange: async (list) => {
      photos = list;
      try {
        const patch = { photos: list.map((i) => i.url) };
        if (list.length && c.photo_status !== 'received') patch.photo_status = 'received';
        c = await api('PATCH', `/custom-orders/${c.id}`, patch);
        toast(list.length ? 'Photos saved to this order.' : 'Photos removed.');
      } catch (err) { toastError(err); }
    },
  });

  const save = async (patch, msg) => {
    try { await api('PATCH', `/custom-orders/${c.id}`, patch); toast(msg); refreshBadges(); navigate(location.pathname, { replace: true }); }
    catch (err) { toastError(err); }
  };
  view.querySelector('[data-form]').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    save({ status: f.status.value, photo_status: f.photo_status.value, approval_status: f.approval_status.value, admin_notes: f.admin_notes.value }, `Customization status: ${labels[f.status.value]}.`);
  });
  view.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.matches('[data-next]')) save({ status: b.dataset.next, ...(b.dataset.next === 'design_approved' ? { approval_status: 'approved' } : {}) }, `Marked as ${labels[b.dataset.next]}.`);
    if (b.matches('[data-copy]')) { try { await navigator.clipboard.writeText(message); toast('Message copied.'); } catch { toast('Copying isn’t available in this browser.', 'error'); } }
  });
}
