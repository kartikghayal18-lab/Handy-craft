import { api, listController, esc, inr, fmtDate, ago, icon, PageHeader, SearchBar, DataTable, Avatar, pager, loadingRows, emptyState } from '../app.js';

export default async function customers({ view, query }) {
  const state = { q: query.get('q') || '', sort: query.get('sort') || '', page: Number(query.get('page')) || 1 };
  view.innerHTML = `
    ${PageHeader({ title: 'Customers', text: 'Everyone who has ordered from you, one record per phone number.' })}
    <section class="card">
      <div class="toolbar">${SearchBar({ value: state.q, placeholder: 'Search name, phone or email', label: 'Search customers' })}</div>
      <div data-list class="list-body">${loadingRows(6)}</div>
    </section>`;
  const list = view.querySelector('[data-list]');
  const ctl = listController({
    view, target: list, state,
    render: async (s) => {
      const d = await api('GET', `/customers?${new URLSearchParams(s)}`);
      if (!d.rows.length) return emptyState(s.q ? 'No customers match' : 'No customers yet', s.q ? 'Try another name, phone or email.' : 'Customers are added when they place an order.', '', 'customers');
      return DataTable({
        sort: s.sort, rowHref: (c) => `/admin/customers/${c.id}`,
        columns: [
          { label: 'Avatar', hideLabel: true, cls: 'td--img', render: (c) => Avatar(c.name, 38) },
          { label: 'Name', sort: 'name', primary: true, render: (c) => `<strong class="nowrap">${esc(c.name)}</strong>${c.order_count > 1 ? ' <span class="pill tone-rose">Repeat</span>' : ''}${c.city ? `<br><small class="muted">${esc(c.city)}</small>` : ''}` },
          { label: 'Email', render: (c) => (c.email ? esc(c.email) : '<span class="muted">—</span>') },
          { label: 'Phone', cls: 'nowrap', render: (c) => esc(c.phone) },
          { label: 'Orders', sort: 'orders', cls: 'num', render: (c) => c.order_count },
          { label: 'Total spent', sort: 'spent', cls: 'num', render: (c) => inr(c.total_spent) },
          { label: 'Last order', sort: 'last', cls: 'nowrap muted', render: (c) => (c.last_order ? ago(c.last_order) : '—') },
          { label: 'Joined', sort: 'joined', cls: 'nowrap muted', render: (c) => fmtDate(c.created_at) },
          { label: 'Action', hideLabel: true, render: (c) => `<a class="icon-btn" href="/admin/customers/${c.id}" aria-label="View ${esc(c.name)}" title="View">${icon('eye')}</a>` },
        ], rows: d.rows,
      }) + pager(d);
    },
  });
  await ctl.load();
}
