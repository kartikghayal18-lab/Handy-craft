import { api, meta, esc, inr, inrShort, fmtDate, ago, icon, pill, StatCard, trend, DataTable, Avatar, emptyState, errorState, loadingRows } from '../app.js';

const RANGES = [['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['3m', 'Last 3 months'], ['1y', 'Last 12 months']];

/** SVG area chart for either revenue or order counts. */
function chartSvg(buckets, metric) {
  const W = 620, H = 220, PL = 46, PB = 26, PT = 12;
  const vals = buckets.map((b) => b[metric]);
  const rawMax = Math.max(...vals, metric === 'revenue' ? 1000 : 4);
  const mag = 10 ** Math.floor(Math.log10(rawMax / 4));
  const step = Math.ceil(rawMax / 4 / mag) * mag;
  const top = step * 4;
  const x = (i) => PL + (buckets.length === 1 ? (W - PL) / 2 : (i * (W - PL - 8)) / (buckets.length - 1));
  const y = (v) => PT + (H - PT - PB) * (1 - v / top);
  const pts = vals.map((v, i) => [x(i), y(v)]);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1y = Math.min(H - PB, p1[1] + (p2[1] - p0[1]) / 6), c2y = Math.min(H - PB, p2[1] - (p3[1] - p1[1]) / 6);
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${c1y} ${p2[0] - (p3[0] - p1[0]) / 6},${c2y} ${p2[0]},${p2[1]}`;
  }
  const fmtAxis = (v) => (metric === 'revenue' ? (v >= 1000 ? `₹${v / 1000}k` : `₹${v}`) : v);
  const lbl = (b) => {
    const s = new Date(`${b.start}T00:00`);
    return b.unit === 'month' ? s.toLocaleDateString('en-IN', { month: 'short' }) : s.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };
  const every = Math.ceil(buckets.length / 6);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${metric === 'revenue' ? 'Revenue' : 'Orders'} over time">
    <defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b3475e" stop-opacity=".32"/><stop offset="1" stop-color="#b3475e" stop-opacity=".02"/></linearGradient></defs>
    ${[0, 1, 2, 3, 4].map((k) => `<line class="chart__grid" x1="${PL}" x2="${W}" y1="${y(k * step)}" y2="${y(k * step)}"/><text class="chart__axis" x="${PL - 8}" y="${y(k * step) + 4}" text-anchor="end">${fmtAxis(k * step)}</text>`).join('')}
    <path class="chart__area" d="${d} L${pts.at(-1)[0]},${H - PB} L${pts[0][0]},${H - PB} Z"/>
    <path class="chart__line" d="${d}"/>
    ${pts.map((p) => `<circle class="chart__dot" cx="${p[0]}" cy="${p[1]}" r="${buckets.length > 14 ? 2.5 : 4}"/>`).join('')}
    ${buckets.map((b, i) => (i % every === 0 || i === buckets.length - 1 ? `<text class="chart__axis" x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(lbl(b))}</text>` : '')).join('')}
  </svg><div class="chart__tip" hidden></div>`;
}

export default async function dashboard({ view }) {
  view.innerHTML = `
    <div class="welcome">
      <div>
        <h1>Good ${['morning', 'afternoon', 'evening'][new Date().getHours() < 12 ? 0 : new Date().getHours() < 17 ? 1 : 2]} <span class="wave" aria-hidden="true">🌸</span></h1>
        <p>Here’s what’s happening with your store today.</p>
      </div>
      <span class="date-chip">${icon('calendar')} ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
    </div>
    <section class="stats stats--dash" data-stats aria-label="Store statistics">${Array.from({ length: 7 }, () => '<div class="card skeleton" style="height:100px"></div>').join('')}</section>
    <nav class="card pipeline" data-pipeline aria-label="Orders by stage"></nav>

    <div class="grid-2">
      <section class="card card--chart" aria-labelledby="chart-title">
        <div class="card__head">
          <h2 id="chart-title">Revenue</h2>
          <div class="card__tools">
            <div class="seg" role="group" aria-label="Chart metric">
              <button type="button" class="seg__btn" data-metric="revenue" aria-pressed="true">Revenue</button>
              <button type="button" class="seg__btn" data-metric="orders" aria-pressed="false">Orders</button>
            </div>
            <label class="visually-hidden" for="range">Chart range</label>
            <select class="input input--sm" id="range" data-range>${RANGES.map(([k, l]) => `<option value="${k}"${k === '30d' ? ' selected' : ''}>${l}</option>`).join('')}</select>
          </div>
        </div>
        <div class="chart" data-chart>${loadingRows(4)}</div>
        <div class="chart-totals" data-chart-totals></div>
      </section>
      <section class="card" aria-labelledby="activity-title">
        <div class="card__head"><h2 id="activity-title">Order Activity</h2><a class="link" href="/admin/orders">All orders ${icon('arrow')}</a></div>
        <div data-activity>${loadingRows(5)}</div>
      </section>
    </div>

    <section class="card" style="margin-bottom:20px" aria-labelledby="recent-title">
      <div class="card__head"><h2 id="recent-title">Recent Orders</h2><a class="link" href="/admin/orders">View all ${icon('arrow')}</a></div>
      <div data-recent>${loadingRows(5)}</div>
    </section>

    <div class="grid-3">
      <section class="card" aria-labelledby="low-title">
        <div class="card__head"><h2 id="low-title">Low Stock</h2><a class="link" href="/admin/inventory?filter=low_stock">Inventory ${icon('arrow')}</a></div>
        <div data-low>${loadingRows(4)}</div>
      </section>
      <section class="card" aria-labelledby="cust-title">
        <div class="card__head"><h2 id="cust-title">Recent Customers</h2><a class="link" href="/admin/customers?sort=joined_desc">View all ${icon('arrow')}</a></div>
        <div data-customers>${loadingRows(4)}</div>
      </section>
      <section class="card" aria-labelledby="quick-title">
        <div class="card__head"><h2 id="quick-title">Quick Actions</h2></div>
        <nav class="quick" aria-labelledby="quick-title">
          <a class="quick--primary" href="/admin/products/new">${icon('plus')} Add New Product</a>
          <a href="/admin/orders/new">${icon('custom')} Add Custom Order ${icon('chevron', 'chev')}</a>
          <a href="/admin/categories">${icon('categories')} Manage Categories ${icon('chevron', 'chev')}</a>
          <a href="/admin/whatsapp">${icon('whatsapp')} WhatsApp Orders ${icon('chevron', 'chev')}</a>
          <a href="/admin/content">${icon('edit')} Edit Website Content ${icon('chevron', 'chev')}</a>
        </nav>
      </section>
    </div>`;

  const $ = (s) => view.querySelector(s);
  let chartData = null, metric = 'revenue';

  const renderChart = () => {
    const c = chartData;
    $('#chart-title').textContent = metric === 'revenue' ? 'Revenue' : 'Orders';
    $('[data-chart]').innerHTML = chartSvg(c.buckets, metric);
    $('[data-chart-totals]').innerHTML = `
      <div><span class="stat__icon stat__icon--gold">${icon('rupee')}</span><span><strong>${inrShort(c.revenue)}</strong><small>Paid revenue</small></span></div>
      <div><span class="stat__icon">${icon('orders')}</span><span><strong>${c.orders}</strong><small>Orders</small></span></div>
      <div><span class="stat__icon">${icon('activity')}</span><span><strong>${c.orders ? inr(Math.round(c.revenue / c.orders)) : '₹0'}</strong><small>Average order</small></span></div>`;
    const svg = $('[data-chart] svg'), tip = $('.chart__tip');
    const dots = [...svg.querySelectorAll('.chart__dot')];
    const show = (clientX) => {
      const r = svg.getBoundingClientRect();
      const px = ((clientX - r.left) / r.width) * 620;
      let best = 0;
      dots.forEach((d, i) => { if (Math.abs(d.cx.baseVal.value - px) < Math.abs(dots[best].cx.baseVal.value - px)) best = i; });
      const b = c.buckets[best], dot = dots[best];
      const when = b.unit === 'day' ? new Date(`${b.start}T00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
        : b.unit === 'week' ? `Week of ${new Date(`${b.start}T00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
        : new Date(`${b.start}T00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      tip.textContent = `${when} · ${inr(b.revenue)} · ${b.orders} ${b.orders === 1 ? 'order' : 'orders'}`;
      tip.style.left = `${Math.min(85, Math.max(15, (dot.cx.baseVal.value / 620) * 100))}%`;
      tip.style.top = `${(dot.cy.baseVal.value / 220) * r.height}px`;
      tip.hidden = false;
    };
    svg.addEventListener('pointermove', (e) => show(e.clientX));
    svg.addEventListener('pointerleave', () => { tip.hidden = true; });
  };

  const load = async () => {
    try {
      const [d, m] = await Promise.all([api('GET', '/dashboard?range=30d'), meta()]);
      const labels = Object.fromEntries(m.order_statuses);
      const s = d.stats;
      $('[data-stats]').innerHTML = [
        StatCard({ label: 'Total Revenue', value: inrShort(s.total_revenue), icon: 'rupee', tone: 'gold', meta: `<strong>${inr(s.month_revenue)}</strong> this month · ${trend(s.month.revenue.change)}`, href: '/admin/orders?filter=confirmed' }),
        StatCard({ label: 'Today’s Revenue', value: inr(s.today_revenue), icon: 'rupee', tone: 'gold', meta: `${s.today_orders} ${s.today_orders === 1 ? 'order' : 'orders'} today` }),
        StatCard({ label: 'Total Orders', value: s.total_orders.toLocaleString('en-IN'), icon: 'orders', meta: trend(s.month.orders.change), href: '/admin/orders' }),
        StatCard({ label: 'Pending Orders', value: s.pending_orders, icon: 'clock', tone: s.pending_orders ? 'warn' : '', meta: 'Awaiting payment on WhatsApp', href: '/admin/orders?filter=pending' }),
        StatCard({ label: 'Custom Orders', value: s.custom_orders, icon: 'custom', meta: `${s.pending_customizations} waiting for the customer`, href: '/admin/custom-orders' }),
        StatCard({ label: 'Customers', value: s.total_customers.toLocaleString('en-IN'), icon: 'customers', meta: `${s.month.customers.value} new this month`, href: '/admin/customers' }),
        StatCard({ label: 'Low Stock', value: s.low_stock, icon: 'alert', tone: s.low_stock ? 'bad' : '', meta: `At or below ${s.low_stock_threshold} left`, href: '/admin/inventory?filter=low_stock' }),
      ].join('');

      $('[data-pipeline]').innerHTML = [
        ['Preparing', s.preparing_orders, '/admin/orders?filter=confirmed', 'Payment confirmed; being made or packed'],
        ['Shipped', s.shipped_orders, '/admin/orders?filter=shipped', 'On the way to the customer'],
        ['Delivered', s.delivered_orders, '/admin/orders?filter=delivered', 'Completed orders'],
        ['Cancelled', s.cancelled_orders, '/admin/orders?filter=cancelled', 'Cancelled orders'],
        ['Customizations pending', s.pending_customizations, '/admin/custom-orders?filter=waiting_for_customer', 'Waiting for photos or details on WhatsApp'],
      ].map(([l, n, href, title]) => `<a class="pipeline__item" href="${href}" title="${title}"><strong>${n.toLocaleString('en-IN')}</strong><span>${l}</span></a>`).join('');

      chartData = d.chart;
      renderChart();

      $('[data-activity]').innerHTML = d.activity.length ? `<ul class="feed">${d.activity.map((e) => `
        <li><span class="feed__dot tone-${e.kind === 'payment' ? 'ok' : e.to_value === 'cancelled' ? 'muted' : 'rose'}"></span>
          <span class="feed__main"><a href="/admin/orders/${e.order_id}"><strong>${esc(e.number)}</strong></a> · ${esc(e.customer_name)}<br>
          <span class="muted">${e.kind === 'status' ? esc(labels[e.to_value] || e.to_value) : esc(e.message)}</span></span>
          <small class="muted nowrap">${ago(e.created_at)}</small></li>`).join('')}</ul>`
        : emptyState('No activity yet', 'New orders and status changes show up here.', '', 'activity');

      $('[data-recent]').innerHTML = d.recent.length ? DataTable({
        compact: true,
        rowHref: (o) => `/admin/orders/${o.id}`,
        columns: [
          { label: 'Order', primary: true, render: (o) => `<strong>${esc(o.number)}</strong>` },
          { label: 'Customer', render: (o) => `<span class="cell-person">${Avatar(o.customer_name, 30)}<span class="nowrap">${esc(o.customer_name)}</span></span>` },
          { label: 'Items', render: (o) => `<span class="cell-product"><img class="thumb" src="${esc(o.first_image)}" alt=""><span class="truncate">${esc(o.first_item)}</span>${o.item_count > 1 ? `<span class="muted">+${o.item_count - 1}</span>` : ''}</span>` },
          { label: 'Amount', cls: 'num', render: (o) => inr(o.total) },
          { label: 'Payment', render: (o) => pill(o.payment_status) },
          { label: 'Status', render: (o) => pill(o.status, labels[o.status]) },
          { label: 'Date', cls: 'nowrap muted', render: (o) => fmtDate(o.created_at) },
          { label: 'Action', hideLabel: true, render: (o) => `<a class="icon-btn" href="/admin/orders/${o.id}" aria-label="View order ${esc(o.number)}">${icon('eye')}</a>` },
        ], rows: d.recent,
      }) : emptyState('No orders yet', 'Orders placed on the website will appear here.', '', 'orders');

      $('[data-low]').innerHTML = d.low_stock.length ? `<ul class="list">${d.low_stock.map((p) => `
        <li><img class="thumb thumb--lg" src="${esc(p.image)}" alt="">
          <a class="list__main" href="/admin/products/${p.id}"><strong>${esc(p.name)}</strong><small>${esc(p.category_name)}${p.sku ? ` · ${esc(p.sku)}` : ''}</small></a>
          ${pill(p.stock_status, p.total_stock <= 0 ? 'Out of stock' : `${p.total_stock} left`)}</li>`).join('')}</ul>`
        : emptyState('Stock looks healthy', 'Nothing is running low right now.', '', 'check');

      $('[data-customers]').innerHTML = d.customers.length ? `<ul class="list">${d.customers.map((c) => `
        <li>${Avatar(c.name, 40)}
          <a class="list__main" href="/admin/customers/${c.id}"><strong>${esc(c.name)}</strong><small>${c.order_count} ${c.order_count === 1 ? 'order' : 'orders'} · ${inr(c.total_spent)}</small></a>
          <small class="muted nowrap">${ago(c.created_at)}</small></li>`).join('')}</ul>`
        : emptyState('No customers yet');
    } catch (err) {
      $('[data-stats]').innerHTML = errorState(err);
      $('[data-retry]')?.addEventListener('click', load);
    }
  };

  view.addEventListener('click', (e) => {
    const b = e.target.closest('[data-metric]');
    if (!b || !chartData) return;
    metric = b.dataset.metric;
    view.querySelectorAll('[data-metric]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderChart();
  });
  $('[data-range]').addEventListener('change', async (e) => {
    const box = $('[data-chart]');
    box.style.opacity = '.5';
    try { chartData = await api('GET', `/chart?range=${e.target.value}`); renderChart(); }
    catch (err) { box.innerHTML = errorState(err); }
    box.style.opacity = '';
  });
  await load();
}
