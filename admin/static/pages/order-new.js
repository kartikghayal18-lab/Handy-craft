import { api, esc, inr, icon, toast, toastError, navigate, setDirty, refreshBadges, errorState } from '../app.js';

export default async function orderNew({ view }) {
  let products;
  try { products = (await api('GET', '/product-options')).rows; }
  catch (err) { view.innerHTML = errorState(err); return; }
  const lines = [{ productId: '', variantId: '', quantity: 1, initial: '', text: '' }];

  view.innerHTML = `
    <a class="crumb" href="/admin/orders">${icon('back')} Orders</a>
    <div class="page-head"><div><h1>Create Order</h1><p>For orders agreed with a customer on WhatsApp or by phone. Prices and stock follow the shop.</p></div></div>
    <form class="form-grid" data-form novalidate>
      <div class="stack">
        <section class="card">
          <div class="card__head"><h2 class="section-title" style="margin:0">Products</h2><button class="btn btn--ghost btn--sm" type="button" data-add>${icon('plus')} Add product</button></div>
          <div data-lines></div>
          <div class="summary-row summary-row--total"><span>Total</span><span data-total>₹0</span></div>
        </section>
      </div>
      <div class="stack">
        <section class="card fields">
          <h2 class="section-title">Customer</h2>
          <div class="field"><label for="n">Full name</label><input id="n" name="name" required minlength="2" maxlength="80" autocomplete="off"></div>
          <div class="field"><label for="ph">Phone / WhatsApp</label><input id="ph" name="phone" type="tel" required minlength="10" maxlength="20" autocomplete="off"></div>
          <div class="field"><label for="em">Email <span>optional</span></label><input id="em" name="email" type="email" maxlength="160" autocomplete="off"></div>
          <div class="field"><label for="ad">Shipping address <span>optional</span></label><textarea id="ad" name="address" rows="3" maxlength="400"></textarea></div>
          <div class="field"><label for="nt">Customer note <span>optional</span></label><textarea id="nt" name="note" rows="2" maxlength="500"></textarea></div>
        </section>
      </div>
      <div class="sticky-actions" style="grid-column:1/-1">
        <a class="btn btn--ghost" href="/admin/orders">Cancel</a>
        <button class="btn btn--primary" type="submit" data-save>Create order</button>
      </div>
    </form>`;

  const $ = (s) => view.querySelector(s);
  const byId = (pid) => products.find((p) => String(p.id) === String(pid));
  const unit = (l) => { const p = byId(l.productId); if (!p) return 0; const v = p.variants.find((x) => String(x.id) === String(l.variantId)); return v ? v.price : p.variants.length ? 0 : p.price; };
  const render = () => {
    $('[data-lines]').innerHTML = lines.map((l, i) => {
      const p = byId(l.productId);
      return `<div class="fields" style="padding:12px 0;border-bottom:1px dashed var(--line)">
        <div class="fields-2">
          <div class="field"><label for="p-${i}">Product</label><select id="p-${i}" data-l="${i}" data-k="productId" required>
            <option value="">— Choose —</option>${products.map((x) => `<option value="${x.id}"${String(x.id) === String(l.productId) ? ' selected' : ''}${x.total_stock <= 0 ? ' disabled' : ''}>${esc(x.name)} · ${x.variants.length ? 'variants' : inr(x.price)}${x.total_stock <= 0 ? ' (sold out)' : ''}</option>`).join('')}</select></div>
          ${p?.variants.length ? `<div class="field"><label for="v-${i}">${esc(p.variants[0].option_name)}</label><select id="v-${i}" data-l="${i}" data-k="variantId" required>
            <option value="">— Choose —</option>${p.variants.map((v) => `<option value="${v.id}"${String(v.id) === String(l.variantId) ? ' selected' : ''}${v.stock <= 0 ? ' disabled' : ''}>${esc(v.name)} · ${inr(v.price)} · ${v.stock} left</option>`).join('')}</select></div>` : `<div class="field"><span class="label">In stock</span><span class="muted">${p ? p.stock : '—'}</span></div>`}
        </div>
        <div class="fields-3">
          <div class="field"><label for="q-${i}">Quantity</label><input id="q-${i}" type="number" min="1" max="10" data-l="${i}" data-k="quantity" value="${l.quantity}"></div>
          ${p?.custom_available && p.custom_type === 'initial' ? `<div class="field"><label for="i-${i}">Initial</label><input id="i-${i}" maxlength="1" data-l="${i}" data-k="initial" value="${esc(l.initial)}" required></div>` : ''}
          ${p?.custom_available ? `<div class="field" style="grid-column:span 2"><label for="t-${i}">Customisation</label><input id="t-${i}" maxlength="240" data-l="${i}" data-k="text" value="${esc(l.text)}" placeholder="Names, colours, notes…"></div>` : ''}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center"><span class="muted">Line total ${inr(unit(l) * l.quantity)}</span>
          ${lines.length > 1 ? `<button class="btn btn--danger btn--sm" type="button" data-remove="${i}">${icon('trash')} Remove</button>` : ''}</div>
      </div>`;
    }).join('');
    $('[data-total]').textContent = inr(lines.reduce((s, l) => s + unit(l) * l.quantity, 0));
  };
  render();

  view.addEventListener('change', (e) => {
    const t = e.target.closest('[data-l]');
    if (!t) return;
    const l = lines[+t.dataset.l];
    l[t.dataset.k] = t.value;
    if (t.dataset.k === 'productId') { l.variantId = ''; l.initial = ''; l.text = ''; }
    if (t.dataset.k === 'quantity') l.quantity = Math.max(1, Math.min(10, Number(t.value) || 1));
    setDirty(true);
    render();
  });
  view.addEventListener('input', (e) => { const t = e.target.closest('[data-l][data-k="text"], [data-l][data-k="initial"]'); if (t) lines[+t.dataset.l][t.dataset.k] = t.value; setDirty(true); });
  view.addEventListener('click', (e) => {
    if (e.target.closest('[data-add]')) { lines.push({ productId: '', variantId: '', quantity: 1, initial: '', text: '' }); render(); }
    const rm = e.target.closest('[data-remove]');
    if (rm) { lines.splice(+rm.dataset.remove, 1); render(); }
  });
  $('[data-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (!f.reportValidity()) return;
    const btn = $('[data-save]'); btn.disabled = true;
    try {
      const r = await api('POST', '/orders', {
        customer: { name: f.name.value, phone: f.phone.value, email: f.email.value, address: f.address.value, note: f.note.value },
        items: lines.map((l) => ({ productId: l.productId, variantId: l.variantId || null, quantity: l.quantity, customization: { initial: l.initial, text: l.text } })),
      });
      setDirty(false);
      toast(`Order ${r.number} created.`);
      refreshBadges();
      navigate(`/admin/orders/${r.id}`, { replace: true });
    } catch (err) { toastError(err); btn.disabled = false; }
  });
  return () => setDirty(false);
}
