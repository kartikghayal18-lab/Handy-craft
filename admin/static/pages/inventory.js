import { api, listController, esc, icon, pill, PageHeader, SearchBar, chips, StatCard, DataTable, pager, loadingRows, emptyState, Modal, toast, refreshBadges } from '../app.js';

const FILTERS = [['all', 'All'], ['in_stock', 'Healthy'], ['low_stock', 'Low Stock'], ['out_of_stock', 'Out of Stock']];

export default async function inventory({ view, query }) {
  const state = { q: query.get('q') || '', filter: query.get('filter') || 'all', sort: query.get('sort') || '', page: Number(query.get('page')) || 1 };
  view.innerHTML = `
    ${PageHeader({ title: 'Inventory', text: 'Stock goes down when an order is placed and back up if it’s cancelled. Adjust it here any time.' })}
    <section class="stats stats--4" data-summary>${Array.from({ length: 4 }, () => '<div class="card skeleton" style="height:96px"></div>').join('')}</section>
    <section class="card">
      <div class="toolbar">${SearchBar({ value: state.q, placeholder: 'Search product, SKU or variant', label: 'Search inventory' })}</div>
      ${chips(FILTERS, state.filter)}
      <div data-list class="list-body">${loadingRows(8)}</div>
    </section>`;
  const list = view.querySelector('[data-list]');
  let rows = [];
  const ctl = listController({
    view, target: list, state,
    render: async (s) => {
      const d = await api('GET', `/inventory?${new URLSearchParams(s)}`);
      rows = d.rows;
      const sm = d.summary;
      view.querySelector('[data-summary]').innerHTML = [
        StatCard({ label: 'Total Products', value: sm.products, icon: 'products', meta: `${sm.units.toLocaleString('en-IN')} units in stock` }),
        StatCard({ label: 'Healthy Stock', value: sm.healthy, icon: 'check', tone: 'ok', meta: 'Above the alert level' }),
        StatCard({ label: 'Low Stock', value: sm.low, icon: 'alert', tone: sm.low ? 'warn' : '', meta: `At or below ${d.threshold}` }),
        StatCard({ label: 'Out of Stock', value: sm.out, icon: 'x', tone: sm.out ? 'bad' : '', meta: 'Can’t be ordered' }),
      ].join('');
      if (!rows.length) return emptyState('Nothing here', s.filter === 'all' && !s.q ? 'Add products to track their stock.' : 'No items match this filter.', '', 'inventory');
      return DataTable({
        sort: s.sort,
        columns: [
          { label: 'Product', sort: 'name', primary: true, render: (r) => `<span class="cell-product"><img class="thumb" src="${esc(r.image)}" alt=""><span><a class="link" href="/admin/products/${r.product_id}">${esc(r.product)}</a>${r.active ? '' : '<br><small class="muted">Draft</small>'}</span></span>` },
          { label: 'SKU', sort: 'sku', cls: 'muted nowrap', render: (r) => esc(r.sku || '—') },
          { label: 'Variant', render: (r) => esc(r.variant || '—') },
          { label: 'Stock', sort: 'stock', cls: 'num', render: (r) => `<strong class="stock-num stock-num--${r.status}">${r.stock}</strong>` },
          { label: 'Threshold', cls: 'num muted', render: (r) => r.threshold },
          { label: 'Status', render: (r) => pill(r.status) },
          { label: 'Action', hideLabel: true, render: (r, i) => `<button class="btn btn--ghost btn--sm" type="button" data-adjust="${r.kind}:${r.id}">${icon('edit')} Adjust</button>` },
        ], rows,
      }) + pager(d);
    },
  });

  const adjust = (r) => Modal({
    title: 'Adjust stock',
    submit: 'Update stock',
    body: `<div class="adjust">
        <div class="cell-product"><img class="thumb thumb--lg" src="${esc(r.image)}" alt=""><span><strong>${esc(r.product)}</strong><br><small class="muted">${esc(r.variant || 'Standard')} · Currently <strong data-now>${r.stock}</strong> in stock</small></span></div>
        <div class="seg seg--full" role="radiogroup" aria-label="Adjustment type">
          <label class="seg__btn"><input type="radio" name="mode" value="add" checked> Add stock</label>
          <label class="seg__btn"><input type="radio" name="mode" value="remove"> Remove</label>
          <label class="seg__btn"><input type="radio" name="mode" value="set"> Set exact</label>
        </div>
        <div class="fields-2">
          <div class="field"><label for="qty">Quantity</label>
            <div class="stepper"><button class="icon-btn" type="button" data-step="-1" aria-label="Decrease">${icon('minus')}</button><input id="qty" name="qty" type="number" min="0" max="100000" step="1" value="1" required inputmode="numeric"><button class="icon-btn" type="button" data-step="1" aria-label="Increase">${icon('plus')}</button></div></div>
          <div class="field"><label for="reason">Reason</label><select id="reason" name="reason"><option>New batch made</option><option>Stock count correction</option><option>Damaged / broken</option><option>Used for display or sample</option><option>Other</option></select></div>
        </div>
        <div class="field"><label for="thr">Low stock alert at <span>for this product</span></label><input id="thr" name="threshold" type="number" min="0" step="1" value="${r.custom_threshold ?? ''}" placeholder="${r.threshold} (store default)"></div>
        <p class="adjust__result">New stock: <strong data-result>${r.stock + 1}</strong></p>
      </div>`,
    onOpen: (form) => {
      const calc = () => {
        const q = Math.max(0, Number(form.qty.value) || 0);
        const mode = form.mode.value;
        const n = mode === 'add' ? r.stock + q : mode === 'remove' ? Math.max(0, r.stock - q) : q;
        form.querySelector('[data-result]').textContent = n;
        return n;
      };
      form.addEventListener('input', calc);
      form.addEventListener('change', calc);
      form.addEventListener('click', (e) => { const b = e.target.closest('[data-step]'); if (b) { form.qty.value = Math.max(0, (Number(form.qty.value) || 0) + Number(b.dataset.step)); calc(); } });
      form._calc = calc;
    },
    onSubmit: async (form) => {
      const q = Number(form.qty.value);
      if (!Number.isInteger(q) || q < 0) throw new Error('Quantity must be a whole number, 0 or more.');
      if (form.mode.value === 'remove' && q > r.stock) throw new Error(`You can remove at most ${r.stock}.`);
      const stock = form._calc();
      const body = { kind: r.kind, id: r.id, stock };
      if (form.threshold.value !== String(r.custom_threshold ?? '')) body.threshold = form.threshold.value === '' ? null : Number(form.threshold.value);
      await api('PATCH', '/inventory', body);
      toast(`Stock updated: ${r.product}${r.variant ? ` (${r.variant})` : ''} is now ${stock}.`);
      refreshBadges(); ctl.load();
    },
  });

  view.addEventListener('click', (e) => {
    const b = e.target.closest('[data-adjust]');
    if (!b) return;
    const [kind, id] = b.dataset.adjust.split(':');
    adjust(rows.find((r) => r.kind === kind && String(r.id) === String(id)));
  });
  await ctl.load();
}
