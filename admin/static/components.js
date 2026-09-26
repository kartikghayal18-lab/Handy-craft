/**
 * Forever Handy admin: reusable UI components.
 *
 * String components return HTML (escaped). Interactive components (Modal,
 * ConfirmDialog, Toast, ImageUploader) manage their own DOM and events.
 *
 *   PageHeader · StatCard · StatusBadge (pill) · Avatar · SearchBar · FilterBar (chips)
 *   DataTable · Pagination (pager) · EmptyState · LoadingState · ErrorState
 *   OrderTimeline · Modal · ConfirmDialog (confirmBox) · Toast · ImageUploader
 */
import { esc, icon, labelize, initials } from './lib.js';

/* ---------- Status badge ---------- */
const TONES = {
  order_placed: 'warn', payment_confirmed: 'ok', confirmed: 'ok', customization_pending: 'violet', customization_received: 'violet',
  in_production: 'info', ready_to_ship: 'rose', shipped: 'info', delivered: 'ok', cancelled: 'muted',
  pending: 'warn', paid: 'ok', failed: 'bad', refunded: 'muted',
  waiting_for_customer: 'warn', photos_pending: 'warn', photos_received: 'violet', requirements_received: 'violet',
  design_pending: 'info', design_approved: 'ok', completed: 'ok',
  in_stock: 'ok', low_stock: 'warn', out_of_stock: 'bad', active: 'ok', inactive: 'muted', draft: 'muted',
  approved: 'ok', hidden: 'muted', not_required: 'muted', received: 'ok', changes_requested: 'bad', featured: 'rose',
};
const LABELS = { in_stock: 'In Stock', low_stock: 'Low Stock', out_of_stock: 'Out of Stock', design_approved: 'Approved', confirmed: 'Payment Confirmed', failed: 'Payment Failed' };
export const pill = (key, text) => `<span class="pill tone-${TONES[key] || 'muted'}">${esc(text || LABELS[key] || labelize(key))}</span>`;
export const StatusBadge = pill;

/* ---------- Avatar ---------- */
const AVATAR_TONES = ['#7a1f33', '#95602c', '#3d4f7a', '#3f6b3a', '#6a3d7a', '#8a5a12'];
export function Avatar(name, size = 36) {
  const n = String(name || '?');
  const tone = AVATAR_TONES[[...n].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return `<span class="avatar avatar--sm" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px;background:${tone}" aria-hidden="true">${esc(initials(n))}</span>`;
}

/* ---------- Page header ---------- */
export const PageHeader = ({ title, text = '', actions = '', crumb = null }) => `
  ${crumb ? `<a class="crumb" href="${esc(crumb.href)}">${icon('back')} ${esc(crumb.label)}</a>` : ''}
  <div class="page-head">
    <div><h1>${title}</h1>${text ? `<p>${text}</p>` : ''}</div>
    ${actions ? `<div class="page-head__actions">${actions}</div>` : ''}
  </div>`;

/* ---------- Stat card ---------- */
export const StatCard = ({ label, value, icon: ic = 'box', meta = '', tone = '', href = '' }) => {
  const inner = `<span class="stat__icon${tone ? ` stat__icon--${tone}` : ''}">${icon(ic)}</span>
    <div class="stat__body"><div class="stat__label">${esc(label)}</div><div class="stat__value">${value}</div>${meta ? `<div class="stat__meta">${meta}</div>` : ''}</div>`;
  return href ? `<a class="card stat stat--link" href="${esc(href)}">${inner}</a>` : `<div class="card stat">${inner}</div>`;
};
export const trend = (change, suffix = 'vs last month') => {
  if (change === null || change === undefined) return '<span class="muted">No data last month</span>';
  const up = change >= 0;
  return `<span class="trend trend--${up ? 'up' : 'down'}">${up ? '↑' : '↓'} ${Math.abs(change)}%</span> ${suffix}`;
};

/* ---------- Search + filters ---------- */
export const SearchBar = ({ value = '', placeholder = 'Search', label = 'Search' } = {}) => `
  <div class="searchbar">${icon('search')}
    <input class="input-search" type="search" placeholder="${esc(placeholder)}" aria-label="${esc(label)}" value="${esc(value)}" data-q>
  </div>`;
export const chips = (options, current, attr = 'data-filter', counts = null) =>
  `<div class="chips" role="group" aria-label="Filter">${options.map(([k, l]) => `<button class="chip" type="button" ${attr}="${k}" aria-pressed="${k === current}">${esc(l)}${counts && counts[k] !== undefined ? ` <span class="chip__count">${counts[k]}</span>` : ''}</button>`).join('')}</div>`;
export const FilterBar = chips;
export const SelectFilter = ({ name, label, options, value }) =>
  `<label class="select-filter"><span class="visually-hidden">${esc(label)}</span><select class="input" data-select="${esc(name)}">${options.map(([k, l]) => `<option value="${esc(k)}"${String(k) === String(value) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;

/* ---------- States ---------- */
export const loadingRows = (n = 5) => Array.from({ length: n }, () => '<div class="skeleton skeleton-row"></div>').join('');
export const LoadingState = loadingRows;
export const emptyState = (title, text = '', action = '', ic = 'box') =>
  `<div class="empty">${icon(ic)}<strong>${esc(title)}</strong>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
export const EmptyState = emptyState;
export const errorState = (err) =>
  `<div class="error-state">${icon('alert')}<p>${esc(err?.message || 'Something went wrong.')}</p><button class="btn btn--ghost btn--sm" type="button" data-retry>Try again</button></div>`;
export const ErrorState = errorState;

/* ---------- Pagination ---------- */
export function pager(data) {
  if (!data || !data.total) return '';
  const from = (data.page - 1) * (data.perPage || 12) + 1;
  const to = Math.min(data.total, from + data.rows.length - 1);
  if (data.pages <= 1) return `<div class="pager"><span>${data.total} ${data.total === 1 ? 'result' : 'results'}</span></div>`;
  const nums = [];
  for (let i = 1; i <= data.pages; i++) if (i === 1 || i === data.pages || Math.abs(i - data.page) <= 1) nums.push(i); else if (nums.at(-1) !== '…') nums.push('…');
  return `<nav class="pager" aria-label="Pagination"><span>${from}–${to} of ${data.total}</span>
    <span class="pager__btns">
      <button class="btn btn--ghost btn--sm" type="button" data-page="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''} aria-label="Previous page">${icon('left')}</button>
      ${nums.map((n) => (n === '…' ? '<span class="pager__gap">…</span>' : `<button class="btn btn--sm ${n === data.page ? 'btn--primary' : 'btn--ghost'}" type="button" data-page="${n}" ${n === data.page ? 'aria-current="page"' : ''}>${n}</button>`)).join('')}
      <button class="btn btn--ghost btn--sm" type="button" data-page="${data.page + 1}" ${data.page >= data.pages ? 'disabled' : ''} aria-label="Next page">${icon('right')}</button>
    </span></nav>`;
}
export const Pagination = pager;

/* ---------- Data table ----------
   columns: [{ key, label, render(row), sort: 'apiKey', cls, hideLabel, primary, m }]
   On phones each row becomes a card; td[data-label] supplies the field name.
   m: 'half' puts the field in a two-column grid on phones, 'corner' pins it top-right. */
export function DataTable({ columns, rows, sort = '', rowHref = null, compact = false, caption = '' }) {
  const head = columns.map((c) => {
    const lbl = c.hideLabel ? `<span class="visually-hidden">${esc(c.label)}</span>` : esc(c.label);
    if (!c.sort) return `<th class="${c.cls || ''}">${lbl}</th>`;
    const active = sort === c.sort || sort === `${c.sort}_desc`;
    const dir = sort === c.sort ? 'ascending' : sort === `${c.sort}_desc` ? 'descending' : 'none';
    return `<th class="${c.cls || ''}" aria-sort="${dir}"><button class="sort" type="button" data-sort="${c.sort}">${lbl}${icon(active ? (dir === 'ascending' ? 'sortUp' : 'sortDown') : 'sort', 'sort__icon')}</button></th>`;
  }).join('');
  const body = rows.map((r) => `<tr${rowHref ? ` data-href="${esc(rowHref(r))}"` : ''}>${columns.map((c) =>
    `<td class="${c.cls || ''}${c.primary ? ' td--primary' : ''}${c.m ? ` m-${c.m}` : ''}" data-label="${esc(c.hideLabel ? '' : c.label)}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table class="dt${compact ? ' table--compact' : ''}">${caption ? `<caption class="visually-hidden">${esc(caption)}</caption>` : ''}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
/** Cycles a sort key: none → asc → desc → none. */
export const nextSort = (current, key) => (current === key ? `${key}_desc` : current === `${key}_desc` ? '' : key);

/* ---------- Order timeline ---------- */
export const OrderTimeline = (steps) => `<ol class="timeline">${steps.map((s) =>
  `<li class="${s.state ? `is-${s.state}` : ''}"><span class="timeline__dot"></span><strong>${esc(s.label)}</strong>${s.time ? `<small>${esc(s.time)}</small>` : ''}${s.note ? `<small>${esc(s.note)}</small>` : ''}</li>`).join('')}</ol>`;

/* ---------- Toast ---------- */
export function toast(message, type = 'success') {
  const box = document.querySelector('[data-toasts]');
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = message;
  const x = document.createElement('button');
  x.type = 'button'; x.className = 'toast__close'; x.setAttribute('aria-label', 'Dismiss'); x.innerHTML = icon('x');
  x.addEventListener('click', () => el.remove());
  el.append(x);
  box.append(el);
  setTimeout(() => el.remove(), type === 'error' ? 6000 : 3500);
}
export const Toast = toast;
export const toastError = (err) => toast(err?.message || 'Unable to save changes. Please try again.', 'error');

/* ---------- Confirm dialog ---------- */
export function confirmBox({ title = 'Are you sure?', message = '', confirm = 'Confirm', danger = false } = {}) {
  const dlg = document.querySelector('[data-confirm]');
  dlg.querySelector('[data-confirm-title]').textContent = title;
  dlg.querySelector('[data-confirm-msg]').textContent = message;
  dlg.querySelector('[data-confirm-ok]').textContent = confirm;
  dlg.classList.toggle('is-danger', danger);
  dlg.returnValue = '';
  dlg.showModal();
  dlg.querySelector('[value="cancel"]').focus();
  return new Promise((resolve) => dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true }));
}
export const ConfirmDialog = confirmBox;

/* ---------- Modal ----------
   Modal({ title, body, submit, onSubmit(form) → resolves to close, wide })
   Returns { el, form, close }. Errors thrown by onSubmit show inside the modal. */
export function Modal({ title, body, submit = 'Save', cancel = 'Cancel', onSubmit = null, wide = false, danger = false, onOpen = null }) {
  const dlg = document.createElement('dialog');
  dlg.className = `modal${wide ? ' modal--wide' : ''}`;
  dlg.innerHTML = `<form class="modal__card" novalidate>
      <header class="modal__head"><h2 class="modal__title">${title}</h2>
        <button class="icon-btn" type="button" data-modal-close aria-label="Close">${icon('x')}</button></header>
      <div class="modal__body">${body}</div>
      <p class="form-error" data-modal-error hidden></p>
      <footer class="modal__foot">
        ${cancel ? `<button class="btn btn--ghost" type="button" data-modal-close>${esc(cancel)}</button>` : ''}
        ${onSubmit ? `<button class="btn ${danger ? 'btn--danger-solid' : 'btn--primary'}" type="submit" data-modal-submit>${esc(submit)}</button>` : ''}
      </footer></form>`;
  document.body.append(dlg);
  const form = dlg.querySelector('form');
  const close = () => { dlg.close(); };
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-modal-close]')) close(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!onSubmit) return close();
    const err = dlg.querySelector('[data-modal-error]');
    err.hidden = true;
    if (!form.reportValidity()) return;
    const btn = dlg.querySelector('[data-modal-submit]');
    btn.disabled = true;
    try {
      const keepOpen = await onSubmit(form, dlg);
      if (keepOpen !== true) close();
    } catch (ex) {
      err.textContent = ex.message || 'Unable to save changes. Please try again.';
      err.hidden = false;
    }
    btn.disabled = false;
  });
  dlg.showModal();
  onOpen?.(form, dlg);
  (form.querySelector('input:not([type=hidden]):not([disabled]), select, textarea') || form.querySelector('[data-modal-close]'))?.focus();
  return { el: dlg, form, close };
}

/* ---------- Image uploader ----------
   ImageUploader(container, { images: [{url, alt}], max, single, upload(file, onProgress) → {url}, onChange(images) })
   Upload area (click or drop), previews, primary image, reorder, alt text, delete. */
export function ImageUploader(container, { images = [], max = 12, single = false, primary = !single, upload, onChange = () => {}, altText = true, hint = 'JPG, PNG, WebP or GIF · up to 4 MB' }) {
  let list = images.map((i) => ({ ...i }));
  const emit = () => onChange(list.filter((i) => !i.uploading).map(({ url, alt }) => ({ url, alt })));
  const render = () => {
    const tiles = list.map((im, i) => `
      <div class="image-tile${im.uploading ? ' is-uploading' : ''}">
        ${i === 0 && primary ? '<span class="pill tone-rose image-tile__primary">Primary</span>' : ''}
        <img src="${esc(im.preview || im.url)}" alt="">${im.uploading ? `<span class="image-tile__progress" role="status">Uploading${im.progress ? ` ${im.progress}%` : '…'}</span>` : ''}
        ${altText ? `<input class="image-tile__alt" placeholder="Alt text" aria-label="Image ${i + 1} description" value="${esc(im.alt || '')}" data-alt="${i}" maxlength="150">` : ''}
        <div class="image-tile__bar">
          ${single ? '' : `<button class="icon-btn" type="button" data-img-move="${i}" data-dir="-1" aria-label="Move left" ${i === 0 ? 'disabled' : ''}>${icon('left')}</button>
          ${primary ? `<button class="icon-btn" type="button" data-img-primary="${i}" aria-label="Make primary image" title="Make primary" ${i === 0 ? 'disabled' : ''}>${icon('star')}</button>` : ''}
          <button class="icon-btn" type="button" data-img-move="${i}" data-dir="1" aria-label="Move right" ${i === list.length - 1 ? 'disabled' : ''}>${icon('right')}</button>`}
          <button class="icon-btn" type="button" data-img-del="${i}" aria-label="Remove image" title="Remove">${icon('trash')}</button>
        </div>
      </div>`).join('');
    const canAdd = list.length < (single ? 1 : max);
    container.innerHTML = `<div class="images${single ? ' images--single' : ''}">${tiles}${canAdd ? `
      <label class="dropzone" data-drop>${icon('upload')}<span>${single ? 'Upload image' : 'Add images'}</span><small>or drag &amp; drop</small><small class="muted">${esc(hint)}</small>
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" ${single ? '' : 'multiple'} data-file></label>` : ''}</div>`;
  };
  const add = async (files) => {
    for (const file of [...files].slice(0, (single ? 1 : max) - list.length)) {
      if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) { toast(`${file.name}: please choose a JPG, PNG, WebP or GIF image.`, 'error'); continue; }
      if (file.size > 4 * 1024 * 1024) { toast(`${file.name} is larger than 4 MB.`, 'error'); continue; }
      const entry = { url: '', alt: '', preview: URL.createObjectURL(file), uploading: true };
      if (single) list = [];
      list.push(entry); render();
      const onProgress = (pct) => {
        entry.progress = Math.min(pct, 99);   // 100% only once Cloudinary + the database have confirmed
        const tag = container.querySelectorAll('.image-tile')[list.indexOf(entry)]?.querySelector('.image-tile__progress');
        if (tag) tag.textContent = `Uploading ${entry.progress}%`;
      };
      try { entry.url = (await upload(file, onProgress)).url; entry.uploading = false; if (entry.preview) URL.revokeObjectURL(entry.preview); entry.preview = ''; }
      catch (err) { list.splice(list.indexOf(entry), 1); toastError(err); }
      render(); emit();
    }
  };
  container.addEventListener('change', (e) => { if (e.target.matches('[data-file]')) { add(e.target.files); e.target.value = ''; } });
  container.addEventListener('input', (e) => { if (e.target.matches('[data-alt]')) { list[+e.target.dataset.alt].alt = e.target.value; emit(); } });
  container.addEventListener('dragover', (e) => { const d = e.target.closest('[data-drop]'); if (d) { e.preventDefault(); d.classList.add('is-over'); } });
  container.addEventListener('dragleave', (e) => e.target.closest('[data-drop]')?.classList.remove('is-over'));
  container.addEventListener('drop', (e) => { const d = e.target.closest('[data-drop]'); if (d) { e.preventDefault(); d.classList.remove('is-over'); add(e.dataTransfer.files); } });
  container.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.matches('[data-img-move]')) { const i = +b.dataset.imgMove, j = i + Number(b.dataset.dir); [list[i], list[j]] = [list[j], list[i]]; }
    else if (b.matches('[data-img-primary]')) { const [im] = list.splice(+b.dataset.imgPrimary, 1); list.unshift(im); }
    else if (b.matches('[data-img-del]')) list.splice(+b.dataset.imgDel, 1);
    else return;
    render(); emit();
  });
  render();
  return { get images() { return list; }, get busy() { return list.some((i) => i.uploading); } };
}
