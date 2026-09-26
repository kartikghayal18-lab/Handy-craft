import { api, meta, esc, icon, pill, PageHeader, SearchBar, loadingRows, emptyState, errorState, toast, toastError, confirmBox, Modal, ImageUploader, uploaderFor, debounce } from '../app.js';

const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const products = (n) => `${n} ${n === 1 ? 'product' : 'products'}`;

/**
 * Categories are a tree one level deep: main categories (e.g. Shop by Person, Occasions, Custom Gifts),
 * each with subcategories (Occasions › Anniversary). The order here is the order customers see.
 */
export default async function categories({ view }) {
  view.innerHTML = `
    ${PageHeader({ title: 'Categories', text: 'Main categories and their subcategories, e.g. Occasions › Anniversary. The order here is the order customers see.',
      actions: `<button class="btn btn--primary" type="button" data-new>${icon('plus')} Add Category</button>` })}
    <div class="toolbar">${SearchBar({ placeholder: 'Search categories', label: 'Search categories' })}
      <div class="seg" role="group" aria-label="Layout"><button type="button" class="seg__btn" data-layout="grid" aria-pressed="true">${icon('grid')}<span class="visually-hidden">Cards</span></button><button type="button" class="seg__btn" data-layout="list" aria-pressed="false">${icon('list')}<span class="visually-hidden">List</span></button></div>
    </div>
    <div data-list>${loadingRows(4)}</div>`;
  const list = view.querySelector('[data-list]');
  let rows = [], q = '', layout = 'grid';

  const byId = (id) => rows.find((c) => String(c.id) === String(id));   // ids may be numbers or UUIDs
  const tops = () => rows.filter((c) => !c.parent_id);
  const subsOf = (c) => rows.filter((x) => x.parent_id === c.id);
  const siblings = (c) => (c.parent_id ? subsOf(byId(c.parent_id)) : tops());
  const matches = (c) => !q || c.name.toLowerCase().includes(q) || c.slug.includes(q);

  const moveBtns = (c, horizontal) => {
    const sib = siblings(c), i = sib.indexOf(c);
    return `<span class="order-ctl"><button class="icon-btn" type="button" data-move="${c.id}" data-dir="-1" aria-label="Move ${esc(c.name)} earlier" ${i === 0 || q ? 'disabled' : ''}>${icon(horizontal ? 'left' : 'up')}</button>
      <span class="order-ctl__num" aria-label="Position">${i + 1}</span>
      <button class="icon-btn" type="button" data-move="${c.id}" data-dir="1" aria-label="Move ${esc(c.name)} later" ${i === sib.length - 1 || q ? 'disabled' : ''}>${icon(horizontal ? 'right' : 'down')}</button></span>`;
  };
  const actions = (c) => `
    <button class="icon-btn" type="button" data-edit="${c.id}" aria-label="Edit ${esc(c.name)}" title="Edit">${icon('edit')}</button>
    <button class="icon-btn icon-btn--danger" type="button" data-del="${c.id}" aria-label="Delete ${esc(c.name)}" title="Delete">${icon('trash')}</button>`;
  const toggle = (c) => `<label class="switch switch--inline" title="Show in the shop"><span class="visually-hidden">Show ${esc(c.name)} in the shop</span><input type="checkbox" data-active="${c.id}"${c.active ? ' checked' : ''}></label>`;
  const count = (c) => `<a class="link" href="/admin/products?category=${c.id}">${products(c.product_count)}${c.product_count !== c.active_count ? ` · ${c.active_count} live` : ''}</a>`;
  const thumb = (c, cls) => (c.image_url ? `<img class="${cls}" src="${esc(c.image_url)}" alt="">` : `<span class="${cls} ${cls}--ph">${icon('image')}</span>`);

  const render = () => {
    if (!rows.length) { list.innerHTML = emptyState('No categories yet', 'Add a main category such as Occasions, then its subcategories such as Birthday or Anniversary.', '<button class="btn btn--primary" type="button" data-new>Add Category</button>', 'categories'); return; }
    // a main category shows when it or any of its subcategories match the search
    const shownTops = tops().filter((t) => matches(t) || subsOf(t).some(matches));
    if (!shownTops.length) { list.innerHTML = emptyState('No categories match', 'Try another search.'); return; }
    const subsShown = (t) => (q && !matches(t) ? subsOf(t).filter(matches) : subsOf(t));

    list.innerHTML = layout === 'grid' ? `<div class="cat-tree">${shownTops.map((t) => `
      <article class="card cat-main${t.active ? '' : ' is-off'}">
        <div class="cat-main__media">${thumb(t, 'cat-main__img')}<span class="cat-tile__status">${pill(t.active ? 'active' : 'inactive', t.active ? 'Live' : 'Hidden')}</span></div>
        <div class="cat-main__body">
          <div><h2 class="cat-tile__name">${esc(t.name)}</h2><p class="muted">${esc(t.description || 'No description')}</p></div>
          <p class="cat-main__meta">${count(t)} · ${t.child_count} ${t.child_count === 1 ? 'subcategory' : 'subcategories'}</p>
        </div>
        <footer class="cat-tile__foot">${moveBtns(t, true)}<span class="actions">${toggle(t)}${actions(t)}</span></footer>
        <div class="cat-subs">
          <p class="cat-subs__title">Subcategories</p>
          ${subsShown(t).length ? `<ul class="cat-subs__list">${subsShown(t).map((c) => `
            <li class="cat-sub${c.active ? '' : ' is-off'}">
              ${thumb(c, 'cat-sub__img')}
              <span class="cat-sub__text"><strong>${esc(c.name)}</strong>${count(c)}</span>
              <span class="cat-sub__tools">${moveBtns(c, false)}${toggle(c)}${actions(c)}</span>
            </li>`).join('')}</ul>` : '<p class="muted cat-subs__empty">No subcategories yet.</p>'}
          <button class="btn btn--ghost btn--sm cat-subs__add" type="button" data-new-sub="${t.id}">${icon('plus')} Add subcategory</button>
        </div>
      </article>`).join('')}</div>`
      : `<section class="card"><div class="table-wrap"><table class="dt"><thead><tr><th>Order</th><th>Category</th><th class="num">Products</th><th>Show</th><th><span class="visually-hidden">Actions</span></th></tr></thead><tbody>${shownTops.flatMap((t) => [t, ...subsShown(t)]).map((c) => `<tr class="${c.parent_id ? 'cat-row--sub' : 'cat-row--main'}">
        <td data-label="Order">${moveBtns(c, false)}</td>
        <td class="td--primary" data-label="${c.parent_id ? 'Subcategory' : 'Category'}"><span class="cell-product">${c.parent_id ? `<span class="cat-row__branch" aria-hidden="true">↳</span>` : ''}${thumb(c, c.parent_id ? 'cat-sub__img' : 'thumb cat-row__img')}<span><strong>${esc(c.name)}</strong><br><small class="muted">${c.parent_id ? esc(byId(c.parent_id)?.name || '') : `${c.child_count} subcategories`}</small></span></span></td>
        <td class="num" data-label="Products">${count(c)}</td>
        <td data-label="Show">${toggle(c)}</td>
        <td data-label=""><div class="actions">${c.parent_id ? '' : `<button class="icon-btn" type="button" data-new-sub="${c.id}" aria-label="Add a subcategory to ${esc(c.name)}" title="Add subcategory">${icon('plus')}</button>`}${actions(c)}</div></td></tr>`).join('')}</tbody></table></div></section>`;
  };
  const load = async () => {
    try { rows = (await api('GET', '/categories')).rows; render(); }
    catch (err) { list.innerHTML = errorState(err); }
  };

  /** Add or edit a category. `parentId` preselects the main category when adding a subcategory. */
  const edit = (c = null, parentId = null) => {
    let image = c?.image_url ? [{ url: c.image_url, alt: c.image_alt }] : [];
    let slugTouched = !!c;
    let uploader;
    const parent = c ? c.parent_id : parentId;
    const hasSubs = c && !c.parent_id && c.child_count > 0;
    const isSub = !!parent;
    Modal({
      title: c ? `Edit ${esc(c.name)}` : isSub ? `Add a subcategory to ${esc(byId(parent)?.name || '')}` : 'Add Category',
      submit: c ? 'Save changes' : isSub ? 'Create subcategory' : 'Create category',
      body: `<div class="fields">
        <div class="field"><label for="c-parent">Where it goes</label>
          <select id="c-parent" name="parent_id"${hasSubs ? ' disabled' : ''}>
            <option value="">Main category</option>
            ${tops().filter((t) => String(t.id) !== String(c?.id)).map((t) => `<option value="${t.id}"${String(t.id) === String(parent) ? ' selected' : ''}>Inside ${esc(t.name)}</option>`).join('')}
          </select>
          <span class="hint">${hasSubs ? 'It has subcategories, so it stays a main category.' : 'A main category, or a subcategory inside one (e.g. Anniversary inside Occasions).'}</span></div>
        <div class="field"><label for="c-name">Name</label><input id="c-name" name="name" required maxlength="80" value="${esc(c?.name || '')}" placeholder="${isSub ? 'e.g. Anniversary' : 'e.g. Occasions'}"></div>
        <div class="field"><label for="c-slug">Slug</label><input id="c-slug" name="slug" maxlength="80" value="${esc(c?.slug || '')}"><span class="hint">Used in the shop link, e.g. /shop/<strong data-slug>${esc(c?.slug || 'your-category')}</strong></span></div>
        <div class="field"><label for="c-description">Short description</label><input id="c-description" name="description" maxlength="300" value="${esc(c?.description || '')}" placeholder="e.g. Gifts to celebrate the years together"></div>
        <div class="field"><span class="label">Image <span>wide images work best (2:1)</span></span><div data-uploader></div></div>
        <label class="switch"><span>Show in the shop</span><input type="checkbox" name="active"${!c || c.active ? ' checked' : ''}></label>
      </div>`,
      onOpen: (form) => {
        uploader = ImageUploader(form.querySelector('[data-uploader]'), { images: image, single: true, upload: uploaderFor('category'), onChange: (l) => { image = l; } });
        form.addEventListener('input', (e) => {
          if (e.target.name === 'name' && !slugTouched) form.slug.value = slugify(e.target.value);
          if (e.target.name === 'slug') slugTouched = true;
          form.querySelector('[data-slug]').textContent = form.slug.value || 'your-category';
        });
      },
      onSubmit: async (form) => {
        if (uploader.busy) throw new Error('Please wait for the image to finish uploading.');
        const body = { name: form.name.value, slug: form.slug.value || slugify(form.name.value), description: form.description.value,
          parent_id: hasSubs ? null : form.parent_id.value || null,
          image_url: image[0]?.url || '', image_alt: image[0]?.alt || form.name.value, active: form.active.checked };
        await api(c ? 'PUT' : 'POST', c ? `/categories/${c.id}` : '/categories', body);
        toast(c ? 'Category updated.' : body.parent_id ? 'Subcategory created.' : 'Category created.');
        meta(true); load();
      },
    });
  };

  view.querySelector('[data-q]').addEventListener('input', debounce((e) => { q = e.target.value.trim().toLowerCase(); render(); }, 200));
  view.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.matches('[data-new]')) return edit();
    if (t.matches('[data-new-sub]')) return edit(null, t.dataset.newSub);
    if (t.matches('[data-retry]')) return load();
    if (t.matches('[data-layout]')) { layout = t.dataset.layout; view.querySelectorAll('[data-layout]').forEach((b) => b.setAttribute('aria-pressed', String(b === t))); return render(); }
    if (t.matches('[data-edit]')) return edit(byId(t.dataset.edit));
    if (t.matches('[data-move]')) {
      const c = byId(t.dataset.move);
      const sib = siblings(c), i = sib.indexOf(c), j = i + Number(t.dataset.dir);
      [sib[i], sib[j]] = [sib[j], sib[i]];
      try {
        await api('POST', '/categories/reorder', { ids: sib.map((r) => r.id) });
        toast(`“${c.name}” moved to position ${j + 1}.`); meta(true); load();
      } catch (err) { toastError(err); load(); }
    }
    if (t.matches('[data-del]')) {
      const c = byId(t.dataset.del);
      const subs = c.parent_id ? 0 : c.child_count;
      const ok = await confirmBox({ title: `Delete “${c.name}”?`,
        message: [subs ? `Its ${subs} subcategor${subs > 1 ? 'ies' : 'y'} will be deleted too.` : '',
          c.product_count ? `Its ${products(c.product_count)} stay in Products; they just won’t be listed here any more.` : '', 'This can’t be undone.'].filter(Boolean).join(' '),
        confirm: subs ? 'Delete category and subcategories' : 'Delete category', danger: true });
      if (!ok) return;
      try { await api('DELETE', `/categories/${c.id}`); toast('Category deleted.'); meta(true); load(); } catch (err) { toastError(err); }
    }
  });
  view.addEventListener('change', async (e) => {
    const sw = e.target.closest('[data-active]');
    if (!sw) return;
    const c = byId(sw.dataset.active);
    try {
      await api('PATCH', `/categories/${c.id}`, { active: sw.checked });
      toast(sw.checked ? `“${c.name}” is live in the shop.` : `“${c.name}” is hidden from the shop${!c.parent_id && c.child_count ? ', with its subcategories' : ''}.`);
      load();
    } catch (err) { sw.checked = !sw.checked; toastError(err); }
  });
  await load();
}
