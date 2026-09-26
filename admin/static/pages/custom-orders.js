import { api, meta, listController, esc, fmtDate, icon, pill, labelize, PageHeader, SearchBar, chips, DataTable, Avatar, pager, loadingRows, emptyState } from '../app.js';

export default async function customOrders({ view, query }) {
  const m = await meta();
  const labels = Object.fromEntries(m.custom_statuses);
  const FILTERS = [['open', 'Open'], ['all', 'All'], ...m.custom_statuses];
  const state = { q: query.get('q') || '', filter: query.get('filter') || 'open', page: Number(query.get('page')) || 1 };
  view.innerHTML = `
    ${PageHeader({ title: 'Custom Orders', text: 'Personalised pieces: photos, initials and requirements to confirm with each customer.' })}
    <section class="card">
      <div class="toolbar">${SearchBar({ value: state.q, placeholder: 'Search order, customer, phone or product', label: 'Search custom orders' })}</div>
      <div data-chips>${chips(FILTERS, state.filter)}</div>
      <div data-list class="list-body">${loadingRows(6)}</div>
    </section>`;
  const list = view.querySelector('[data-list]');
  const ctl = listController({
    view, target: list, state,
    render: async (s) => {
      const d = await api('GET', `/custom-orders?${new URLSearchParams(s)}`);
      view.querySelector('[data-chips]').innerHTML = chips(FILTERS, s.filter, 'data-filter', d.counts);
      if (!d.rows.length) return emptyState('No custom orders here', s.q ? 'Try another search.' : 'Orders with personalisation appear here automatically.', '', 'custom');
      return DataTable({
        rowHref: (c) => `/admin/custom-orders/${c.id}`,
        columns: [
          { label: 'Order ID', primary: true, render: (c) => `<a class="link" href="/admin/orders/${c.order_id}"><strong>${esc(c.number)}</strong></a>` },
          { label: 'Customer', render: (c) => `<span class="cell-person">${Avatar(c.customer_name, 32)}<span class="nowrap">${esc(c.customer_name)}</span></span>` },
          { label: 'Product', render: (c) => `<span class="cell-product"><img class="thumb" src="${esc(c.image_url)}" alt=""><span><span class="truncate">${esc(c.product_name)}</span><br><small class="muted truncate">${esc(c.customer_instructions)}</small></span></span>` },
          { label: 'Customization', render: (c) => pill(c.status, labels[c.status]) + (c.order_status === 'cancelled' ? ` ${pill('cancelled', 'Order cancelled')}` : '') },
          { label: 'Photos', render: (c) => pill(c.photo_status === 'pending' ? 'photos_pending' : c.photo_status, c.photo_status === 'received' ? `Received${c.photos?.length ? ` (${c.photos.length})` : ''}` : labelize(c.photo_status)) },
          { label: 'WhatsApp', render: (c) => `<a class="wa-btn" href="${esc(c.chat)}" data-wa-name="${esc(c.customer_name)}" aria-label="WhatsApp ${esc(c.customer_name)}">${icon('whatsapp')}</a>` },
          { label: 'Date', cls: 'nowrap muted', render: (c) => fmtDate(c.order_date) },
          { label: 'Action', hideLabel: true, render: (c) => `<a class="icon-btn" href="/admin/custom-orders/${c.id}" aria-label="Open custom order" title="Open">${icon('eye')}</a>` },
        ], rows: d.rows,
      }) + pager(d);
    },
  });
  await ctl.load();
}
