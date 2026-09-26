import { api, meta, listController, esc, inr, icon, pill, PageHeader, SearchBar, chips, SelectFilter, DataTable, pager, loadingRows, emptyState, toast, toastError, confirmBox, Modal, refreshBadges } from '../app.js';

const FILTERS = [['all', 'All'], ['active', 'Active'], ['inactive', 'Inactive'], ['featured', 'Featured'], ['bestseller', 'Bestseller'], ['low_stock', 'Low Stock'], ['out_of_stock', 'Out of Stock']];
const SORTS = [['', 'Shop order'], ['newest', 'Newest first'], ['name', 'Name A–Z'], ['name_desc', 'Name Z–A'], ['price', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['stock', 'Stock: lowest first'], ['stock_desc', 'Stock: highest first'], ['category', 'Category']];

const priceCell = (p) => (p.variants.length ? `<span class="muted">from</span> ${inr(Math.min(...p.variants.map((x) => x.price)))}` : inr(p.price))
  + (p.compare_at_price ? `<br><s class="muted">${inr(p.compare_at_price)}</s>` : '');

function quickView(p) {
  Modal({
    title: esc(p.name), wide: true, cancel: 'Close', submit: '',
    body: `<div class="quickview">
      <div class="quickview__media"><img src="${esc(p.image)}" alt="">${p.images.length > 1 ? `<div class="quickview__thumbs">${p.images.map((i) => `<img src="${esc(i.url)}" alt="">`).join('')}</div>` : ''}</div>
      <div class="quickview__info">
        <p class="muted" style="margin:0">${esc(p.category_name || 'No category')} · ${esc(p.sku || 'No SKU')}</p>
        <p class="quickview__price">${priceCell(p)}</p>
        <p>${pill(p.active ? 'active' : 'inactive')} ${pill(p.stock_status, p.total_stock <= 0 ? 'Out of stock' : `${p.total_stock} in stock`)} ${p.featured ? pill('featured', 'Featured') : ''} ${p.bestseller ? pill('approved', 'Bestseller') : ''}</p>
        <p>${esc(p.short_description)}</p>
        ${p.variants.length ? `<dl class="kv">${p.variants.map((v) => `<dt>${esc(v.option_name)}: ${esc(v.name)}</dt><dd>${inr(v.price)} · ${v.stock} in stock</dd>`).join('')}</dl>` : ''}
        <dl class="kv" style="margin-top:12px">
          ${p.material ? `<dt>Material</dt><dd>${esc(p.material)}</dd>` : ''}${p.size ? `<dt>Size</dt><dd>${esc(p.size)}</dd>` : ''}
          <dt>Customization</dt><dd>${p.custom_available ? esc({ text: 'Text / notes', initial: 'Initial', photo: 'Customer photo' }[p.custom_type] || 'Yes') : 'Not available'}</dd>
        </dl>
        <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
          <a class="btn btn--primary" href="/admin/products/${p.id}" data-modal-close>${icon('edit')} Edit product</a>
        </div>
      </div></div>`,
  });
}

export default async function products({ view, query }) {
  const state = { q: query.get('q') || '', filter: query.get('filter') || 'all', sort: query.get('sort') || '', category: query.get('category') || '', page: Number(query.get('page')) || 1 };
  const m = await meta(true);
  view.innerHTML = `
    ${PageHeader({ title: 'Products', text: 'Create, edit and organise the gifts in your shop.', actions: `<a class="btn btn--primary" href="/admin/products/new">${icon('plus')} Add Product</a>` })}
    <section class="card">
      <div class="toolbar">
        ${SearchBar({ value: state.q, placeholder: 'Search by name or SKU', label: 'Search products' })}
        ${SelectFilter({ name: 'category', label: 'Category', value: state.category, options: [['', 'All categories'], ...m.categories.map((c) => [c.id, c.path])] })}
        ${SelectFilter({ name: 'sort', label: 'Sort', value: state.sort, options: SORTS })}
      </div>
      <div data-chips>${chips(FILTERS, state.filter)}</div>
      <div data-list class="list-body">${loadingRows(6)}</div>
    </section>`;
  const list = view.querySelector('[data-list]');
  let rows = [];

  const ctl = listController({
    view, target: list, state,
    render: async (s) => {
      const d = await api('GET', `/products?${new URLSearchParams(s)}`);
      rows = d.rows;
      view.querySelector('[data-chips]').innerHTML = chips(FILTERS, s.filter, 'data-filter', d.counts);
      const sel = view.querySelector('[data-select="sort"]'); sel.value = SORTS.some(([k]) => k === s.sort) ? s.sort : '';
      if (!rows.length) {
        const filtered = s.q || s.filter !== 'all' || s.category;
        return emptyState(filtered ? 'No products match' : 'No products yet', filtered ? 'Try another search or filter.' : 'Add your first piece to start selling.',
          filtered ? '<button class="btn btn--ghost" type="button" data-clear>Clear filters</button>' : '<a class="btn btn--primary" href="/admin/products/new">Add Product</a>', 'products');
      }
      return DataTable({
        sort: s.sort, rowHref: (p) => `/admin/products/${p.id}`,
        columns: [
          { label: 'Image', hideLabel: true, cls: 'td--img', render: (p) => `<img class="thumb thumb--lg" src="${esc(p.image)}" alt="">` },
          { label: 'Product', sort: 'name', primary: true, render: (p) => `<strong>${esc(p.name)}</strong><br><small class="muted">${esc(p.sku || '—')}${p.variants.length ? ` · ${p.variants.length} variants` : ''}</small>` },
          { label: 'Category', sort: 'category', render: (p) => esc(p.category_name || '—') },
          { label: 'Price', sort: 'price', cls: 'num', render: priceCell },
          { label: 'Stock', sort: 'stock', cls: 'num', render: (p) => (p.stock_status === 'in_stock' ? String(p.total_stock) : pill(p.stock_status, p.total_stock <= 0 ? 'Out of stock' : `${p.total_stock} left`)) },
          { label: 'Status', render: (p) => pill(p.active ? 'active' : 'inactive') },
          { label: 'Featured', render: (p) => `<label class="switch switch--inline"><span class="visually-hidden">Featured: ${esc(p.name)}</span><input type="checkbox" data-flag="featured" data-id="${p.id}"${p.featured ? ' checked' : ''}></label>` },
          { label: 'Bestseller', render: (p) => `<label class="switch switch--inline"><span class="visually-hidden">Bestseller: ${esc(p.name)}</span><input type="checkbox" data-flag="bestseller" data-id="${p.id}"${p.bestseller ? ' checked' : ''}></label>` },
          { label: 'Actions', hideLabel: true, render: (p) => `<div class="actions">
            <button class="icon-btn" type="button" data-quick="${p.id}" aria-label="View ${esc(p.name)}" title="View">${icon('eye')}</button>
            <a class="icon-btn" href="/admin/products/${p.id}" aria-label="Edit ${esc(p.name)}" title="Edit">${icon('edit')}</a>
            <button class="icon-btn" type="button" data-dup="${p.id}" aria-label="Duplicate ${esc(p.name)}" title="Duplicate">${icon('copy')}</button>
            <button class="icon-btn" type="button" data-toggle="${p.id}" aria-label="${p.active ? 'Disable' : 'Enable'} ${esc(p.name)}" title="${p.active ? 'Disable' : 'Enable'}">${icon(p.active ? 'eyeOff' : 'check')}</button>
            <button class="icon-btn icon-btn--danger" type="button" data-del="${p.id}" aria-label="Delete ${esc(p.name)}" title="Delete">${icon('trash')}</button>
          </div>` },
        ], rows,
      }) + pager(d);
    },
  });

  const find = (id) => rows.find((p) => String(p.id) === String(id));
  view.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.matches('[data-clear]')) { Object.assign(state, { q: '', filter: 'all', category: '', page: 1 }); view.querySelector('[data-q]').value = ''; view.querySelector('[data-select="category"]').value = ''; return ctl.load(); }
    if (t.matches("[data-quick]")) return quickView(find(t.dataset.quick));
    try {
      if (t.matches('[data-dup]')) { const p = await api('POST', `/products/${t.dataset.dup}/duplicate`); toast(`Duplicated as “${p.name}”. It stays disabled until you enable it.`); ctl.load(); }
      if (t.matches('[data-toggle]')) {
        const p = find(t.dataset.toggle);
        await api('PATCH', `/products/${p.id}`, { active: !p.active });
        toast(p.active ? `“${p.name}” disabled. It’s hidden from the shop.` : `“${p.name}” enabled.`);
        ctl.load(); refreshBadges();
      }
      if (t.matches('[data-del]')) {
        const p = find(t.dataset.del);
        if (!(await confirmBox({ title: 'Delete product?', message: `“${p.name}” will be removed from the shop. Past orders keep their details.`, confirm: 'Delete', danger: true }))) return;
        await api('DELETE', `/products/${p.id}`);
        toast('Product deleted.');
        ctl.load(); refreshBadges();
      }
    } catch (err) { toastError(err); }
  });
  view.addEventListener('change', async (e) => {
    const flag = e.target.closest('[data-flag]');
    if (!flag) return;
    try {
      await api('PATCH', `/products/${flag.dataset.id}`, { [flag.dataset.flag]: flag.checked });
      toast(`${flag.dataset.flag === 'featured' ? 'Featured' : 'Bestseller'} ${flag.checked ? 'on' : 'off'}.`);
    } catch (err) { flag.checked = !flag.checked; toastError(err); }
  });
  await ctl.load();
  if (query.get('view')) { const p = rows.find((x) => String(x.id) === query.get('view')); if (p) quickView(p); }
}
