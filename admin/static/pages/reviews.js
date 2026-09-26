import { api, listController, esc, fmtDate, icon, pill, PageHeader, chips, StatCard, Avatar, pager, loadingRows, emptyState, toast, toastError, confirmBox, refreshBadges } from '../app.js';

const FILTERS = [['all', 'All'], ['pending', 'Pending'], ['approved', 'Approved'], ['hidden', 'Hidden'], ['featured', 'Featured']];
const stars = (n) => `<span class="stars" aria-label="${n} out of 5 stars">${'★'.repeat(n)}<span class="stars__off">${'★'.repeat(5 - n)}</span></span>`;

export default async function reviews({ view, query }) {
  const state = { filter: query.get('filter') || 'all', page: Number(query.get('page')) || 1 };
  view.innerHTML = `
    ${PageHeader({ title: 'Reviews', text: 'Only approved reviews appear in the shop. Featured reviews are shown first.' })}
    <section class="stats stats--4" data-summary></section>
    <section class="card">
      <div data-chips>${chips(FILTERS, state.filter)}</div>
      <div data-list class="list-body">${loadingRows(5)}</div>
    </section>`;
  const list = view.querySelector('[data-list]');
  let rows = [];
  const ctl = listController({
    view, target: list, state,
    render: async (s) => {
      const d = await api('GET', `/reviews?${new URLSearchParams(s)}`);
      rows = d.rows;
      view.querySelector('[data-chips]').innerHTML = chips(FILTERS, s.filter, 'data-filter', d.counts);
      view.querySelector('[data-summary]').innerHTML = [
        StatCard({ label: 'Average rating', value: `${d.average || '—'} <small class="stat__of">/ 5</small>`, icon: 'star', tone: 'gold', meta: `${d.counts.approved} approved reviews` }),
        StatCard({ label: 'Waiting for approval', value: d.counts.pending, icon: 'clock', tone: d.counts.pending ? 'warn' : '' }),
        StatCard({ label: 'Featured', value: d.counts.featured, icon: 'sparkle' }),
        StatCard({ label: 'Hidden', value: d.counts.hidden, icon: 'eyeOff' }),
      ].join('');
      if (!rows.length) return emptyState('No reviews here', s.filter === 'all' ? 'Customers can leave a review from any product.' : 'Nothing matches this filter.', '', 'reviews');
      return `<ul class="reviews">${rows.map((r, i) => `
        <li class="review${r.status === 'pending' ? ' review--pending' : ''}">
          ${Avatar(r.customer_name, 44)}
          <div class="review__body">
            <div class="review__head">
              <strong>${esc(r.customer_name)}</strong>${stars(r.rating)}
              <span class="muted">· ${fmtDate(r.created_at)}</span>
              <span class="review__badges">${pill(r.status)}${r.featured ? pill('featured', 'Featured') : ''}</span>
            </div>
            <p class="review__text">${esc(r.body || 'No written review.')}</p>
            <a class="review__product" href="/admin/products/${r.product_id}"><img class="thumb" src="${esc(r.product_image)}" alt="">${esc(r.product_name)}</a>
          </div>
          <div class="review__actions">
            ${r.status !== 'approved' ? `<button class="btn btn--primary btn--sm" type="button" data-act="approve" data-i="${i}">${icon('check')} Approve</button>` : ''}
            ${r.status !== 'hidden' ? `<button class="btn btn--ghost btn--sm" type="button" data-act="hide" data-i="${i}">${icon('eyeOff')} Hide</button>` : ''}
            ${r.status === 'approved' ? `<button class="btn btn--ghost btn--sm" type="button" data-act="feature" data-i="${i}" aria-pressed="${!!r.featured}">${icon('star')} ${r.featured ? 'Unfeature' : 'Feature'}</button>` : ''}
            <button class="icon-btn icon-btn--danger" type="button" data-act="delete" data-i="${i}" aria-label="Delete review by ${esc(r.customer_name)}" title="Delete">${icon('trash')}</button>
          </div>
        </li>`).join('')}</ul>${pager(d)}`;
    },
  });
  view.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const r = rows[+b.dataset.i];
    try {
      if (b.dataset.act === 'approve') { await api('PATCH', `/reviews/${r.id}`, { status: 'approved' }); toast('Review approved.'); }
      if (b.dataset.act === 'hide') { await api('PATCH', `/reviews/${r.id}`, { status: 'hidden' }); toast('Review hidden from the shop.'); }
      if (b.dataset.act === 'feature') { await api('PATCH', `/reviews/${r.id}`, { featured: !r.featured }); toast(r.featured ? 'Review unfeatured.' : 'Review featured.'); }
      if (b.dataset.act === 'delete') {
        if (!(await confirmBox({ title: 'Delete review?', message: `The review by ${r.customer_name} will be removed permanently.`, confirm: 'Delete', danger: true }))) return;
        await api('DELETE', `/reviews/${r.id}`); toast('Review deleted.');
      }
      refreshBadges(); ctl.load();
    } catch (err) { toastError(err); }
  });
  await ctl.load();
}
