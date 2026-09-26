import { api, esc, inr, ago, icon, pill, PageHeader, Avatar, emptyState, errorState, toast, toastError, setDirty, confirmBox } from '../app.js';

const TEMPLATES = [
  ['whatsapp_template', 'Default order message', 'What customers send you when they place an order.'],
  ['whatsapp_custom_template', 'Customization message', 'What you send to ask for photos and details.'],
  ['whatsapp_confirm_template', 'Order confirmation', 'What you send once the payment is confirmed.'],
];
const PLACEHOLDERS = ['{{ORDER_ID}}', '{{FULL_NAME}}', '{{PHONE}}', '{{CUSTOMER_NAME}}', '{{PRODUCT_NAME}}', '{{QUANTITY}}', '{{TOTAL}}', '{{CUSTOMIZATION}}', '{{ITEMS}}', '{{PRODUCT}}', '{{STORE_NAME}}'];
// Preview only: placeholder values show where each order detail goes (not a real order).
const SAMPLE = {
  '{{CUSTOMER_NAME}}': 'Customer', '{{FULL_NAME}}': 'Customer Name', '{{PHONE}}': '+91 00000 00000', '{{ORDER_ID}}': 'SA-0000',
  '{{PRODUCT}}': 'Product name', '{{PRODUCT_NAME}}': 'Product name', '{{QUANTITY}}': '1', '{{TOTAL}}': '0',
  '{{ITEMS}}': 'Product:\nProduct name\nQuantity:\n1',
  '{{CUSTOMIZATION}}': 'Customization: Customization details\nI will send my customization photos/details here.',
};

export default async function whatsapp({ view }) {
  let d, s, defaults;
  try { [d, { settings: s, defaults }] = await Promise.all([api('GET', '/whatsapp'), api('GET', '/settings')]); }
  catch (err) { view.innerHTML = errorState(err); return; }
  let active = TEMPLATES[0][0];
  const drafts = Object.fromEntries(TEMPLATES.map(([k]) => [k, s[k]]));
  const fill = (tpl) => PLACEHOLDERS.reduce((out, p) => out.replaceAll(p, p === '{{STORE_NAME}}' ? s.store_name : SAMPLE[p]), tpl);

  view.innerHTML = `
    ${PageHeader({ title: 'WhatsApp', text: 'Orders open WhatsApp with their details. You carry on each conversation yourself; there are no bots.' })}
    <p class="notice">${icon('info')} WhatsApp buttons open a chat with a prefilled message. You send it yourself; photos and replies stay in WhatsApp, so mark them in the order when they arrive.</p>
    <div class="form-grid">
      <div class="stack">
        <section class="card">
          <form class="fields" data-number-form>
            <h2 class="section-title">Business WhatsApp number</h2>
            <div class="field"><label for="w-num">Number with country code</label>
              <div class="input-prefix"><span>+</span><input id="w-num" name="whatsapp_number" value="${esc(s.whatsapp_number)}" inputmode="tel" maxlength="15" placeholder="919876543210"></div>
              <span class="hint">Digits only, e.g. 91 followed by the 10-digit number. Orders are sent here.</span></div>
            <div class="btn-row"><button class="btn btn--primary btn--sm" type="submit">Save number</button><button class="btn btn--ghost btn--sm" type="button" data-test>${icon('whatsapp')} Send test message</button></div>
          </form>
        </section>

        <section class="card">
          <h2 class="section-title">Message templates</h2>
          <div class="tabs" role="tablist">${TEMPLATES.map(([k, l]) => `<button type="button" role="tab" class="tabs__tab" data-tpl="${k}" aria-selected="${k === active}">${l}</button>`).join('')}</div>
          <form class="fields" data-tpl-form>
            <p class="muted" data-tpl-help style="margin:0"></p>
            <div class="field"><label for="w-tpl" class="visually-hidden">Message</label>
              <textarea id="w-tpl" name="template" rows="12" maxlength="2000" required class="mono-area"></textarea></div>
            <div class="placeholders"><span class="muted">Insert:</span>${PLACEHOLDERS.map((p) => `<button type="button" class="chip chip--sm" data-insert="${p}">${p.replace(/[{}]/g, '')}</button>`).join('')}</div>
            <div class="btn-row"><span class="muted" data-tpl-status></span><span style="flex:1"></span>
              <button class="btn btn--ghost btn--sm" type="button" data-reset>Restore default</button>
              <button class="btn btn--primary btn--sm" type="submit">Save template</button></div>
          </form>
        </section>
      </div>

      <aside class="stack">
        <section class="card">
          <h2 class="section-title">Preview</h2>
          <div class="wa-phone">
            <div class="wa-phone__bar">${Avatar(s.store_name, 30)}<span><strong>${esc(s.store_name)}</strong><small>+${esc(s.whatsapp_number || '—')}</small></span></div>
            <div class="wa-phone__chat"><pre class="wa-bubble wa-bubble--out" data-preview></pre></div>
          </div>
          <p class="hint" style="margin:10px 0 0">Preview with placeholder values; each order fills in its own details.</p>
        </section>
        <section class="card">
          <div class="card__head"><h2 class="section-title" style="margin:0">Waiting for you</h2><span class="count">${d.waiting.length}</span></div>
          ${d.waiting.length ? `<ul class="list">${d.waiting.slice(0, 8).map((o) => `
            <li>${Avatar(o.customer_name, 38)}
              <a class="list__main" href="/admin/orders/${o.id}"><strong>${esc(o.customer_name)}</strong><small>${esc(o.number)} · ${inr(o.total)} · ${ago(o.created_at)}</small></a>
              ${o.payment_status !== 'confirmed' ? pill('pending', 'Payment pending') : pill('photos_pending', 'Photos')}
              <a class="wa-btn" href="${esc(o.chat)}" data-wa-name="${esc(o.customer_name)}" aria-label="Chat with ${esc(o.customer_name)}">${icon('whatsapp')}</a></li>`).join('')}</ul>`
            : emptyState('All caught up', 'No orders are waiting for a conversation.', '', 'check')}
        </section>
      </aside>
    </div>`;

  const tplForm = view.querySelector('[data-tpl-form]');
  const area = tplForm.template;
  const status = view.querySelector('[data-tpl-status]');
  const showTemplate = () => {
    const t = TEMPLATES.find(([k]) => k === active);
    area.value = drafts[active];
    view.querySelector('[data-tpl-help]').textContent = t[2];
    view.querySelectorAll('[data-tpl]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tpl === active)));
    status.textContent = drafts[active] !== s[active] ? 'Unsaved changes' : '';
    view.querySelector('[data-preview]').textContent = fill(area.value);
  };
  showTemplate();

  area.addEventListener('input', () => { drafts[active] = area.value; status.textContent = 'Unsaved changes'; setDirty(true); view.querySelector('[data-preview]').textContent = fill(area.value); });
  view.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.matches('[data-tpl]')) { active = b.dataset.tpl; showTemplate(); }
    if (b.matches('[data-insert]')) {
      const [a, z] = [area.selectionStart, area.selectionEnd];
      area.setRangeText(b.dataset.insert, a, z, 'end');
      area.focus();
      area.dispatchEvent(new Event('input'));
    }
    if (b.matches('[data-reset]')) {
      if (!(await confirmBox({ title: 'Restore the default message?', message: 'Your edits to this template will be replaced.', confirm: 'Restore' }))) return;
      drafts[active] = defaults[active]; showTemplate(); setDirty(true); status.textContent = 'Unsaved changes';
    }
    if (b.matches('[data-test]')) {
      const n = view.querySelector('#w-num').value.replace(/\D/g, '');
      if (n.length < 10) { toast('Enter a valid WhatsApp number first.', 'error'); return; }
      window.open(`https://wa.me/${n}?text=${encodeURIComponent(fill(drafts.whatsapp_template))}`, '_blank', 'noopener');
      toast(`Opened WhatsApp with a preview of the order message to +${n}.`);
    }
  });
  tplForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!area.value.trim()) { toast('The message can’t be empty.', 'error'); return; }
    try {
      s = (await api('PUT', '/settings', { [active]: area.value })).settings;
      status.textContent = 'Saved';
      setDirty(TEMPLATES.some(([k]) => drafts[k] !== s[k]));
      toast(`${TEMPLATES.find(([k]) => k === active)[1]} saved.`);
    } catch (err) { toastError(err); }
  });
  view.querySelector('[data-number-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      s = (await api('PUT', '/settings', { whatsapp_number: e.target.whatsapp_number.value })).settings;
      e.target.whatsapp_number.value = s.whatsapp_number;
      view.querySelector('.wa-phone__bar small').textContent = `+${s.whatsapp_number}`;
      toast('WhatsApp number saved.');
    } catch (err) { toastError(err); }
  });
  return () => setDirty(false);
}
