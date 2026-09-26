import { api, meta, listController, esc, inr, fmtDate, icon, pill, PageHeader, SearchBar, chips, DataTable, Avatar, pager, loadingRows, emptyState } from '../app.js';

const FILTERS = [['all', 'All'], ['pending', 'Payment Pending'], ['confirmed', 'Payment Confirmed'], ['customization_pending', 'Customization Pending'],
  ['customization_received', 'Customization Received'], ['in_production', 'In Production'], ['ready_to_ship', 'Ready to Ship'],
  ['shipped', 'Shipped'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']];

/** Shared by Orders, Customer detail. */
export function orderTable(rows, labels, { customer = true, sort = '' } = {}) {
  return DataTable({
    sort, rowHref: (o) => `/admin/orders/${o.id}`,
    columns: [
      { label: 'Order ID', sort: customer ? 'number' : '', primary: true, render: (o) => `<strong>${esc(o.number)}</strong>` },
      ...(customer ? [{ label: 'Customer', sort: 'customer', render: (o) => `<span class="cell-person">${Avatar(o.customer_name, 32)}<span><span class="nowrap">${esc(o.customer_name)}</span><br><small class="muted nowrap">${esc(o.phone)}</small></span></span>` }] : []),
      { label: 'Items', render: (o) => `<span class="cell-product"><img class="thumb" src="${esc(o.first_image)}" alt=""><span><span class="truncate">${esc(o.first_item)}</span>${o.item_count > 1 ? ` <span class="muted">+${o.item_count - 1}</span>` : ''}<br><small class="muted">Qty ${o.quantity}${o.custom_count ? ' · Custom' : ''}</small></span></span>` },
      { label: 'Amount', sort: customer ? 'total' : '', cls: 'num', render: (o) => inr(o.total) },
      { label: 'Payment', render: (o) => pill(o.payment_status) },
      { label: 'Status', render: (o) => pill(o.status, labels[o.status]) },
      { label: 'Date', sort: customer ? 'date' : '', cls: 'nowrap muted', render: (o) => fmtDate(o.created_at) },
      { label: 'Action', hideLabel: true, render: (o) => `<a class="icon-btn" href="/admin/orders/${o.id}" aria-label="Open order ${esc(o.number)}" title="Open">${icon('eye')}</a>` },
    ], rows,
  });
}

export default async function orders({ view, query }) {
  const state = { q: query.get('q') || '', filter: query.get('filter') || 'all', sort: query.get('sort') || '', page: Number(query.get('page')) || 1 };
  const m = await meta();
  const labels = Object.fromEntries(m.order_statuses);
  view.innerHTML = `
    ${PageHeader({ title: 'Orders', text: 'Every order placed on the website, newest first.', actions: `<a class="btn btn--primary" href="/admin/orders/new">${icon('plus')} Create Order</a>` })}
    <section class="card">
      <div class="toolbar">${SearchBar({ value: state.q, placeholder: 'Search order ID, customer or phone', label: 'Search orders' })}</div>
      <div data-chips>${chips(FILTERS, state.filter)}</div>
      <div data-list class="list-body">${loadingRows(6)}</div>
    </section>`;
  const list = view.querySelector('[data-list]');
  const ctl = listController({
    view, target: list, state,
    render: async (s) => {
      const d = await api('GET', `/orders?${new URLSearchParams(s)}`);
      view.querySelector('[data-chips]').innerHTML = chips(FILTERS, s.filter, 'data-filter', d.counts);
      return d.rows.length ? orderTable(d.rows, labels, { sort: s.sort }) + pager(d)
        : emptyState(s.q || s.filter !== 'all' ? 'No orders match' : 'No orders yet', s.q || s.filter !== 'all' ? 'Try another search or filter.' : 'Orders placed on the website will appear here.', '', 'orders');
    },
  });
  await ctl.load();
}
