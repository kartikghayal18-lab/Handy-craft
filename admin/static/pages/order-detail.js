import { api, meta, esc, inr, fmtDateTime, icon, pill, labelize, PageHeader, OrderTimeline, Avatar, Modal, toast, toastError, confirmBox, errorState, refreshBadges, navigate } from '../app.js';

export default async function orderDetail({ view, params }) {
  const id = params[0];
  const m = await meta();
  const labels = Object.fromEntries(m.order_statuses);
  const customLabels = Object.fromEntries(m.custom_statuses);
  const METHODS = m.method_labels;
  let o;
  try { o = await api('GET', `/orders/${id}`); }
  catch (err) { view.innerHTML = errorState(err); view.querySelector('[data-retry]')?.addEventListener('click', () => navigate(location.pathname, { replace: true })); return; }

  const hasCustom = o.custom.length > 0;
  const address = [o.shipping_address, o.shipping_city, o.shipping_state, o.shipping_pincode].filter(Boolean).join(', ');
  const flow = m.workflow.filter((k) => hasCustom || !k.startsWith('customization_'));
  const reached = new Map(o.events.filter((e) => e.kind === 'status').map((e) => [e.to_value, e.created_at]));
  const cur = flow.indexOf(o.status);
  const steps = o.status === 'cancelled'
    ? [...flow.filter((k) => reached.has(k)).map((k) => ({ label: labels[k], time: fmtDateTime(reached.get(k)), state: 'done' })), { label: 'Cancelled', time: fmtDateTime(reached.get('cancelled')), state: 'cancelled' }]
    : flow.map((k, i) => ({ label: labels[k], time: reached.has(k) ? fmtDateTime(reached.get(k)) : '', state: i < cur || o.status === 'delivered' ? 'done' : i === cur ? 'current' : 'todo' }));
  const next = flow[cur + 1];
  const canNext = next && o.allowed.includes(next);
  const pay = o.payment;
  const PAY = m.payment_labels;   // Pending · Payment Confirmed · Payment Failed · Refunded
  const forward = o.allowed.filter((k) => k !== 'cancelled');

  view.innerHTML = `
    ${PageHeader({ crumb: { href: '/admin/orders', label: 'Orders' }, title: `Order ${esc(o.number)}`,
      text: `Placed ${fmtDateTime(o.created_at)} · ${pill(o.status, labels[o.status])} ${pill(o.payment_status, o.payment_status === 'pending' ? 'Payment Pending' : PAY[o.payment_status])}`,
      actions: `<button class="btn btn--ghost" type="button" data-copy>${icon('copy')} <span class="hide-sm">Copy order message</span></button>
        <a class="btn btn--wa" href="${esc(o.chat)}" data-wa-name="${esc(o.customer_name)}">${icon('whatsapp')} WhatsApp</a>` })}

    ${canNext ? `<div class="next-step card">
      <span class="next-step__text">${icon('info')} Next step: <strong>${esc(labels[next])}</strong></span>
      <button class="btn btn--primary" type="button" data-next="${next}">Move to ${esc(labels[next])} ${icon('arrow')}</button>
    </div>` : o.status === 'order_placed' && ['pending', 'failed'].includes(o.payment_status) ? `<div class="next-step card next-step--warn">
      <span class="next-step__text">${icon('clock')} Waiting for payment on WhatsApp. Confirm it once the money has arrived.</span>
      <button class="btn btn--primary" type="button" data-open-pay>${icon('check')} Confirm Payment</button></div>` : ''}

    <div class="form-grid">
      <div class="stack">
        <section class="card">
          <h2 class="section-title">Products</h2>
          <ul class="order-items">${o.items.map((it) => `
            <li>
              <img class="thumb thumb--xl" src="${esc(it.image_url)}" alt="">
              <div class="order-items__main">
                <strong>${esc(it.product_name)}</strong>
                <small class="muted">${esc(it.variant_name || 'Standard')}${it.sku ? ` · SKU ${esc(it.sku)}` : ''}</small>
                ${it.customization ? `<small class="order-items__custom">${icon('sparkle')} ${esc(it.customization)}</small>` : ''}
              </div>
              <div class="order-items__qty"><span class="muted">${inr(it.unit_price)} × ${it.quantity}</span><strong>${inr(it.subtotal)}</strong></div>
            </li>`).join('')}</ul>
          <div class="summary">
            <div class="summary-row"><span class="muted">Subtotal</span><span>${inr(o.subtotal)}</span></div>
            <div class="summary-row"><span class="muted">Discount</span><span>${o.discount ? `− ${inr(o.discount)}` : inr(0)}</span></div>
            <div class="summary-row"><span class="muted">Shipping</span><span>${o.shipping ? inr(o.shipping) : 'Free'}</span></div>
            <div class="summary-row summary-row--total"><span>Total</span><span>${inr(o.total)}</span></div>
          </div>
        </section>

        ${hasCustom ? `<section class="card">
          <div class="card__head"><h2 class="section-title" style="margin:0">Customization</h2><a class="link" href="/admin/custom-orders?q=${esc(o.number)}">In Custom Orders ${icon('arrow')}</a></div>
          <div class="stack">${o.custom.map((c) => `
            <form class="custom-block" data-custom-form="${c.id}">
              <div class="custom-block__head"><strong>${esc(c.product_name)}${c.variant_name ? ` <span class="muted">(${esc(c.variant_name)})</span>` : ''}</strong>${pill(c.status, customLabels[c.status])}</div>
              <dl class="kv">
                <dt>Customer request</dt><dd>${esc(c.customer_instructions || '—')}</dd>
                ${c.requirements ? `<dt>Requirements</dt><dd>${esc(c.requirements)}</dd>` : ''}
                <dt>Photos</dt><dd>${c.photos?.length ? `<span class="photo-strip">${c.photos.map((u) => `<img src="${esc(u)}" alt="Customer photo">`).join('')}</span>` : pill(c.photo_status === 'pending' ? 'photos_pending' : c.photo_status, labelize(c.photo_status))}</dd>
              </dl>
              <div class="fields-3">
                <div class="field"><label for="cs-${c.id}">Status</label><select id="cs-${c.id}" name="status">${m.custom_statuses.map(([k, l]) => `<option value="${k}"${k === c.status ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
                <div class="field"><label for="ps-${c.id}">Photos</label><select id="ps-${c.id}" name="photo_status">${m.photo_statuses.map((k) => `<option value="${k}"${k === c.photo_status ? ' selected' : ''}>${labelize(k)}</option>`).join('')}</select></div>
                <div class="field"><label for="as-${c.id}">Design approval</label><select id="as-${c.id}" name="approval_status">${m.approval_statuses.map((k) => `<option value="${k}"${k === c.approval_status ? ' selected' : ''}>${labelize(k)}</option>`).join('')}</select></div>
              </div>
              <div class="field"><label for="an-${c.id}">Notes for this piece</label><textarea id="an-${c.id}" name="admin_notes" rows="2" maxlength="2000">${esc(c.admin_notes)}</textarea></div>
              <div><button class="btn btn--ghost btn--sm" type="submit">Save customization</button></div>
            </form>`).join('')}</div>
        </section>` : ''}

        <section class="card">
          <h2 class="section-title">Activity</h2>
          <ul class="events">${[...o.events].reverse().map((e) => `<li>
            <span>${e.kind === 'status' ? `Status → <strong>${esc(labels[e.to_value] || labelize(e.to_value))}</strong>` : esc(e.message)}${e.kind === 'status' && e.message ? ` <span class="muted">· ${esc(e.message)}</span>` : ''}</span>
            <small>${fmtDateTime(e.created_at)}${e.admin_name ? ` · ${esc(e.admin_name)}` : ''}</small></li>`).join('')}</ul>
        </section>
      </div>

      <aside class="stack">
        <section class="card">
          <h2 class="section-title">Order timeline</h2>
          ${OrderTimeline(steps)}
          ${forward.length ? `<form class="fields status-form" data-status-form>
            <div class="field"><label for="st">Change status</label><select id="st" name="status">${forward.map((k) => `<option value="${k}"${k === next ? ' selected' : ''}>${esc(labels[k])}</option>`).join('')}</select></div>
            <div class="field"><label for="st-note">Note <span>optional</span></label><input id="st-note" name="note" maxlength="300" placeholder="e.g. Courier: Delhivery, AWB 1234"></div>
            <button class="btn btn--ghost" type="submit">Update status</button>
          </form>` : ''}
          ${o.allowed.includes('cancelled') ? '<button class="btn btn--danger btn--sm" type="button" data-cancel style="margin-top:12px">Cancel order</button>' : ''}
        </section>

        <section class="card">
          <h2 class="section-title">Customer</h2>
          <div class="person">${Avatar(o.customer_name, 48)}<div><a class="link" href="/admin/customers/${o.customer_id}"><strong>${esc(o.customer_name)}</strong></a><br><small class="muted">Customer #${o.customer_id}</small></div></div>
          <ul class="contact-list">
            <li>${icon('phone')} <a href="tel:${esc(o.phone.replace(/\s/g, ''))}">${esc(o.phone)}</a></li>
            <li>${icon('mail')} ${o.email ? `<a href="mailto:${esc(o.email)}">${esc(o.email)}</a>` : '<span class="muted">No email</span>'}</li>
          </ul>
          ${o.customer_note ? `<p class="note">“${esc(o.customer_note)}”</p>` : ''}
        </section>

        <section class="card">
          <h2 class="section-title">Shipping address</h2>
          <p class="address">${icon('pin')} <span>${esc(address || 'To be shared on WhatsApp')}</span></p>
          ${address ? `<button class="btn btn--ghost btn--sm" type="button" data-copy-address>${icon('copy')} Copy address</button>` : ''}
        </section>

        <section class="card">
          <h2 class="section-title">Payment</h2>
          <dl class="kv">
            <dt>Status</dt><dd>${pill(pay.status, PAY[pay.status])}</dd>
            <dt>Amount</dt><dd>${inr(pay.amount)}</dd>
            <dt>Method</dt><dd>${esc(METHODS[pay.method] || '—')}</dd>
            <dt>Reference</dt><dd>${esc(pay.reference || '—')}</dd>
            <dt>Confirmed</dt><dd>${pay.confirmed_at ? `${fmtDateTime(pay.confirmed_at)}<br><small class="muted">Manually by ${esc(pay.confirmed_by || 'an admin')}</small>` : '—'}</dd>
          </dl>
          <p class="hint" style="margin:10px 0 0">Customers pay over WhatsApp. Confirm here only once the money has reached you; nothing is charged on the website.</p>
          <div class="btn-row">
            ${['pending', 'failed'].includes(pay.status) && o.status !== 'cancelled' ? `<button class="btn btn--primary btn--sm" type="button" data-open-pay>${icon('check')} Confirm Payment</button>` : ''}
            ${pay.status === 'pending' ? '<button class="btn btn--ghost btn--sm" type="button" data-pay="failed">Mark failed</button>' : ''}
            ${pay.status === 'failed' ? '<button class="btn btn--ghost btn--sm" type="button" data-pay="pending">Back to pending</button>' : ''}
            ${pay.status === 'confirmed' ? '<button class="btn btn--ghost btn--sm" type="button" data-pay="refunded">Mark refunded</button>' : ''}
          </div>
        </section>

        <section class="card">
          <form class="fields" data-notes-form>
            <div class="field"><label for="notes" class="section-title" style="margin:0">Admin notes</label>
              <textarea id="notes" name="admin_notes" rows="4" maxlength="2000" placeholder="Only visible to you">${esc(o.admin_notes)}</textarea></div>
            <div><button class="btn btn--ghost btn--sm" type="submit">Save notes</button></div>
          </form>
        </section>
      </aside>
    </div>`;

  const reload = () => navigate(location.pathname, { replace: true });
  const setStatus = async (status, note = '') => {
    try { await api('POST', `/orders/${id}/status`, { status, note }); toast(`Order status updated: ${labels[status]}.`); refreshBadges(); reload(); }
    catch (err) { toastError(err); }
  };
  // Manual only: records who confirmed it and when. No payment service is contacted.
  const openPayment = () => Modal({
    title: 'Confirm Payment', submit: 'Confirm Payment',
    body: `<p class="muted" style="margin:0 0 14px">Confirm once ${inr(o.total)} for order ${esc(o.number)} has reached you. This is recorded as confirmed manually by you.</p>
      <div class="fields">
        <div class="field"><label for="pm">How did they pay? <span>optional</span></label><select id="pm" name="method"><option value="">Not specified</option>${m.payment_methods.map((k) => `<option value="${k}">${esc(METHODS[k])}</option>`).join('')}</select></div>
        <div class="field"><label for="pr">Reference <span>optional</span></label><input id="pr" name="reference" maxlength="120" placeholder="UPI reference, bank UTR or a note"></div>
      </div>`,
    onSubmit: async (f) => {
      await api('POST', `/orders/${id}/payment`, { status: 'confirmed', method: f.method.value, reference: f.reference.value });
      toast(hasCustom ? 'Payment confirmed. Order moved to Customization Pending.' : 'Payment confirmed. Order moved to Payment Confirmed.'); refreshBadges(); reload();
    },
  });

  view.querySelector('[data-status-form]')?.addEventListener('submit', (e) => { e.preventDefault(); setStatus(e.target.status.value, e.target.note.value); });
  view.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.matches('[data-next]')) return setStatus(b.dataset.next);
    if (b.matches('[data-open-pay]')) return openPayment();
    if (b.matches('[data-pay]')) {
      const status = b.dataset.pay;
      const copy = { refunded: ['Mark as refunded?', 'Use this after you’ve returned the money to the customer.', 'Mark refunded'],
        failed: ['Mark payment failed?', 'The order stays open so the customer can try again.', 'Mark failed'],
        pending: ['Back to pending?', 'Use this when the customer is going to try paying again.', 'Back to pending'] }[status];
      if (!(await confirmBox({ title: copy[0], message: copy[1], confirm: copy[2], danger: status !== 'pending' }))) return;
      try { await api('POST', `/orders/${id}/payment`, { status }); toast(`Payment: ${status === 'pending' ? 'Pending' : PAY[status]}.`); refreshBadges(); reload(); } catch (err) { toastError(err); }
    }
    if (b.matches('[data-cancel]')) {
      if (!(await confirmBox({ title: `Cancel order ${o.number}?`, message: `Stock for its items goes back to inventory.${o.payment_status === 'confirmed' ? ' The payment stays confirmed until you mark it refunded.' : ''}`, confirm: 'Cancel order', danger: true }))) return;
      setStatus('cancelled');
    }
    if (b.matches('[data-copy]')) { try { await navigator.clipboard.writeText(o.message); toast('Order message copied.'); } catch { toast('Copying isn’t available in this browser.', 'error'); } }
    if (b.matches('[data-copy-address]')) { try { await navigator.clipboard.writeText(`${o.customer_name}\n${address}\n${o.phone}`); toast('Address copied.'); } catch { toast('Copying isn’t available in this browser.', 'error'); } }
  });
  view.querySelectorAll('[data-custom-form]').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('PATCH', `/custom-orders/${f.dataset.customForm}`, { status: f.status.value, photo_status: f.photo_status.value, approval_status: f.approval_status.value, admin_notes: f.admin_notes.value });
      toast(`Customization: ${customLabels[f.status.value]}.`); refreshBadges(); reload();
    } catch (err) { toastError(err); }
  }));
  view.querySelector('[data-notes-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('PATCH', `/orders/${id}`, { admin_notes: e.target.admin_notes.value }); toast('Notes saved.'); } catch (err) { toastError(err); }
  });
}
