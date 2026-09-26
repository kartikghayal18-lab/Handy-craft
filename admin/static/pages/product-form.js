import { api, meta, esc, icon, PageHeader, ImageUploader, toast, toastError, confirmBox, uploaderFor, navigate, setDirty, refreshBadges, errorState } from '../app.js';

const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const BLANK = {
  name: '', slug: '', short_description: '', description: '', category_ids: [], price: '', compare_at_price: '', sku: '', stock: 0,
  low_stock_threshold: '', active: 1, featured: 0, bestseller: 0, material: '', size: '', weight: '', finish: '', care: '',
  production_time: '', custom_available: 0, custom_type: 'text', custom_instructions: '', whatsapp_required: 0, seo_title: '', seo_description: '', images: [], variants: [],
};
const SECTIONS = [['basics', 'Basic Information'], ['pricing', 'Pricing'], ['images', 'Images'], ['variants', 'Variants'], ['inventory', 'Inventory'], ['categories', 'Categories'], ['custom', 'Customization'], ['details', 'Product Details'], ['seo', 'SEO']];

export default async function productForm({ view, params }) {
  const id = params[0] === 'new' ? null : params[0];
  let p;
  const m = await meta(true);
  try { p = id ? await api('GET', `/products/${id}`) : structuredClone(BLANK); }
  catch (err) { view.innerHTML = errorState(err); return; }
  let images = p.images.map((i) => ({ url: i.url, alt: i.alt }));
  const variants = p.variants.map((v) => ({ ...v }));
  const loadedStock = new Map(p.variants.map((v) => [v.id, v.stock]));   // lets the server keep live stock if you didn't change it
  let optionName = variants[0]?.option_name || 'Size';
  let slugTouched = !!id;
  // Options (Size, Design…) only where the store's data supports them.
  const hasVariants = m.features?.variants !== false;

  const f = (name, label, value, attrs = '', hint = '') => `<div class="field" data-field="${name}"><label for="f-${name}">${label}</label>
    <input id="f-${name}" name="${name}" value="${esc(value ?? '')}" ${attrs}>${hint ? `<span class="hint">${hint}</span>` : ''}<span class="field__error" hidden></span></div>`;
  const ta = (name, label, value, rows = 3, attrs = '', hint = '') => `<div class="field" data-field="${name}"><label for="f-${name}">${label}</label>
    <textarea id="f-${name}" name="${name}" rows="${rows}" ${attrs}>${esc(value ?? '')}</textarea>${hint ? `<span class="hint">${hint}</span>` : ''}<span class="field__error" hidden></span></div>`;
  // Categories: a product can sit in several subcategories at once (e.g. Mom, Birthday and Photo Frames).
  // Each main category is a group of tick-boxes; a main category without subcategories is a box itself.
  const chosen = new Set((p.category_ids || []).map(String));
  const pick = (c, label = c.name) => `<label class="tag-pick"><input type="checkbox" name="category_ids" value="${c.id}"${chosen.has(String(c.id)) ? ' checked' : ''}><span>${esc(label)}</span></label>`;
  const categoryPicks = () => {
    const tops = m.categories.filter((c) => !c.parent_id);
    if (!tops.length) return '<p class="muted" style="margin:0">No categories yet. <a class="link" href="/admin/categories">Add categories</a> first.</p>';
    return tops.map((t) => {
      const subs = m.categories.filter((c) => c.parent_id === t.id);
      return `<fieldset class="tag-picks"><legend>${esc(t.name)}</legend>${subs.length ? subs.map((c) => pick(c)).join('') : pick(t, `All of ${t.name}`)}</fieldset>`;
    }).join('');
  };
  const sw = (name, label, on, hint = '') => `<label class="switch"><span>${label}${hint ? `<br><small class="muted">${hint}</small>` : ''}</span><input type="checkbox" name="${name}"${on ? ' checked' : ''}></label>`;

  view.innerHTML = `
    ${PageHeader({ title: id ? esc(p.name) : 'Add Product', crumb: { href: '/admin/products', label: 'Products' },
      text: id ? `Last updated ${new Date(`${p.updated_at?.replace(' ', 'T')}Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Only the name and price are required. Fill in the rest when you’re ready.',
      actions: id ? `<a class="btn btn--ghost" href="/admin/products?view=${id}">${icon('eye')} Preview</a>` : '' })}
    <nav class="section-nav" aria-label="Form sections">${SECTIONS.filter(([k]) => hasVariants || k !== 'variants').map(([k, l]) => `<a href="#sec-${k}">${l}</a>`).join('')}</nav>
    <form class="form-grid" data-form novalidate>
      <div class="stack">
        <section class="card fields" id="sec-basics">
          <h2 class="section-title">Basic Information</h2>
          ${f('name', 'Product name', p.name, 'required maxlength="120" autocomplete="off"')}
          ${f('slug', 'Slug <span>used in the product link</span>', p.slug, 'maxlength="80"', `${esc(location.host)}/products/<strong data-slug-preview>${esc(p.slug || 'your-product')}</strong>`)}
          ${ta('short_description', 'Short description <span>shown on product cards</span>', p.short_description, 2, 'maxlength="300"')}
          ${ta('description', 'Description', p.description, 6, 'maxlength="5000"')}
        </section>

        <section class="card fields" id="sec-pricing">
          <h2 class="section-title">Pricing</h2>
          <div class="fields-3">
            ${f('price', 'Price (₹)', p.price, 'type="number" min="0" step="1" required inputmode="numeric"')}
            ${f('compare_at_price', 'Compare price (₹) <span>optional</span>', p.compare_at_price, 'type="number" min="0" step="1" inputmode="numeric"', 'Shown struck through when higher.')}
            ${f('sku', 'SKU <span>optional</span>', p.sku, 'maxlength="60"')}
          </div>
          <p class="muted" data-discount style="margin:0"></p>
        </section>

        <section class="card" id="sec-images">
          <h2 class="section-title">Images</h2>
          <p class="muted" style="margin:-6px 0 14px">The first image is the primary one. Use the star to make any image primary, and the arrows to reorder.</p>
          <div data-images></div>
        </section>

        <section class="card" id="sec-variants"${hasVariants ? '' : ' hidden'}>
          <div class="card__head"><h2 class="section-title" style="margin:0">Variants</h2><button class="btn btn--ghost btn--sm" type="button" data-add-variant>${icon('plus')} Add variant</button></div>
          <p class="muted" style="margin:0 0 12px">For choices like Size (Small, Medium, Large) or Design (Heart, Square, Round). Each has its own price and stock.</p>
          <div class="field" data-option-wrap style="max-width:260px;margin-bottom:6px"><label for="f-option">Option name</label><input id="f-option" value="${esc(optionName)}" maxlength="40" data-option></div>
          <div data-variants></div>
        </section>

        <section class="card fields" id="sec-categories">
          <div class="card__head"><h2 class="section-title" style="margin:0">Categories</h2><a class="link" href="/admin/categories">Manage ${icon('arrow')}</a></div>
          <p class="muted" style="margin:0">Tick every place this product should appear in the shop, e.g. <em>Mom</em>, <em>Birthday</em> and <em>Photo Frames</em>. Products without a category stay hidden.</p>
          <div data-field="category_ids" class="fields">${categoryPicks()}</div>
        </section>
        <section class="card fields" id="sec-custom">
          <h2 class="section-title">Customization</h2>
          ${sw('custom_available', 'Customization available', p.custom_available, 'Customers can personalise this piece.')}
          <div class="fields" data-custom ${p.custom_available ? '' : 'hidden'}>
            <div class="field"><label for="f-custom_type">Customization type</label>
              <select id="f-custom_type" name="custom_type">
                <option value="text"${p.custom_type === 'text' ? ' selected' : ''}>Text or notes (names, dates, colours)</option>
                <option value="initial"${p.custom_type === 'initial' ? ' selected' : ''}>Single initial (required letter)</option>
                <option value="photo"${p.custom_type === 'photo' ? ' selected' : ''}>Customer photo</option>
              </select></div>
            ${ta('custom_instructions', 'Instructions for the customer', p.custom_instructions, 2, 'maxlength="500"')}
            ${sw('whatsapp_required', 'WhatsApp required', p.whatsapp_required, 'Photos or details are collected on WhatsApp after the order.')}
          </div>
        </section>

        <section class="card fields" id="sec-details">
          <h2 class="section-title">Product Details</h2>
          <div class="fields-2">
            ${f('material', 'Material', p.material, 'maxlength="120" placeholder="e.g. Oak wood, ceramic, linen"')}
            ${f('size', 'Size', p.size, 'maxlength="120" placeholder="e.g. 15 × 15 cm"')}
            ${f('weight', 'Weight', p.weight, 'maxlength="120" placeholder="e.g. 350 g"')}
            ${f('finish', 'Finish', p.finish, 'maxlength="120" placeholder="e.g. Matte, hand-painted"')}
          </div>
          ${ta('care', 'Care instructions', p.care, 2, 'maxlength="500"')}
          ${f('production_time', 'Production time', p.production_time, 'maxlength="80" placeholder="e.g. 5–7 working days"', 'Leave empty to use the store default.')}
        </section>

        <section class="card fields" id="sec-seo">
          <h2 class="section-title">SEO</h2>
          <div class="seo-preview" aria-label="Search result preview">
            <span class="seo-preview__url">${esc(location.host)} › products › <span data-seo-slug></span></span>
            <span class="seo-preview__title" data-seo-title></span>
            <span class="seo-preview__desc" data-seo-desc></span>
          </div>
          ${f('seo_title', 'Page title <span data-count="seo_title">0/70</span>', p.seo_title, 'maxlength="70"', 'Leave empty to use the product name.')}
          ${ta('seo_description', 'Meta description <span data-count="seo_description">0/160</span>', p.seo_description, 2, 'maxlength="160"', 'Leave empty to use the short description.')}
        </section>
      </div>

      <aside class="stack form-aside">
        <section class="card fields">
          <h2 class="section-title">Status</h2>
          <div class="field"><label for="f-status">Visibility</label>
            <select id="f-status" name="status"><option value="1"${p.active ? ' selected' : ''}>Active: shown in the shop</option><option value="0"${p.active ? '' : ' selected'}>Draft: hidden from the shop</option></select></div>
          ${sw('featured', 'Featured', p.featured, 'Shown first in its category')}
          ${sw('bestseller', 'Bestseller', p.bestseller, 'Adds a Bestseller badge')}
        </section>
        <section class="card fields" id="sec-inventory">
          <h2 class="section-title">Inventory</h2>
          <div data-stock-wrap>${f('stock', 'Stock', p.stock, 'type="number" min="0" step="1" inputmode="numeric"')}</div>
          <p class="muted" data-stock-note hidden style="margin:0">Stock is tracked per variant (total <strong data-variant-total>0</strong>).</p>
          ${f('low_stock_threshold', 'Low stock alert at <span>optional</span>', p.low_stock_threshold, 'type="number" min="0" step="1" inputmode="numeric"', 'Leave empty for the store default.')}
        </section>
      </aside>

      <div class="sticky-actions">
        <span class="sticky-actions__status muted" data-save-status>${id ? 'No unsaved changes' : 'New product'}</span>
        ${id ? `<button class="btn btn--danger" type="button" data-delete>${icon('trash')} <span class="hide-sm">Delete</span></button>` : ''}
        <a class="btn btn--ghost" href="/admin/products">Cancel</a>
        <button class="btn btn--primary" type="submit" data-save>${id ? 'Save changes' : 'Create product'}</button>
      </div>
    </form>`;

  const form = view.querySelector('[data-form]');
  const $ = (s) => view.querySelector(s);
  const dirty = () => { setDirty(true); $('[data-save-status]').textContent = 'Unsaved changes'; };

  const uploader = ImageUploader($('[data-images]'), { images, upload: uploaderFor('product'), onChange: (list) => { images = list; dirty(); } });

  /* ---------- Live previews ---------- */
  const syncPreviews = () => {
    const slug = form.slug.value || slugify(form.name.value) || 'your-product';
    $('[data-slug-preview]').textContent = slug;
    $('[data-seo-slug]').textContent = slug;
    $('[data-seo-title]').textContent = `${form.seo_title.value || form.name.value || 'Product name'} | Forever Handy`;
    $('[data-seo-desc]').textContent = form.seo_description.value || form.short_description.value || 'Add a short description to show here.';
    for (const k of ['seo_title', 'seo_description']) $(`[data-count="${k}"]`).textContent = `${form[k].value.length}/${form[k].maxLength}`;
    const price = Number(form.price.value), cmp = Number(form.compare_at_price.value);
    $('[data-discount]').textContent = price && cmp > price ? `Customers see ${Math.round((1 - price / cmp) * 100)}% off.` : '';
  };
  syncPreviews();

  /* ---------- Variants ---------- */
  const renderVariants = () => {
    $('[data-option-wrap]').hidden = !variants.length;
    $('[data-variants]').innerHTML = variants.length ? variants.map((v, i) => `
      <div class="variant-row">
        <div class="field"><label for="v-name-${i}">Name</label><input id="v-name-${i}" data-v="${i}" data-k="name" value="${esc(v.name)}" maxlength="60" required placeholder="e.g. Medium"></div>
        <div class="field"><label for="v-sku-${i}">SKU</label><input id="v-sku-${i}" data-v="${i}" data-k="sku" value="${esc(v.sku || '')}" maxlength="60"></div>
        <div class="field"><label for="v-price-${i}">Price (₹)</label><input id="v-price-${i}" data-v="${i}" data-k="price" type="number" min="0" step="1" value="${esc(v.price ?? '')}" required></div>
        <div class="field"><label for="v-stock-${i}">Stock</label><input id="v-stock-${i}" data-v="${i}" data-k="stock" type="number" min="0" step="1" value="${esc(v.stock ?? 0)}"></div>
        <div class="field variant-row__order"><span class="label">Order</span><span style="display:flex;gap:2px">
          <button class="icon-btn" type="button" data-v-move="${i}" data-dir="-1" aria-label="Move variant up" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button>
          <button class="icon-btn" type="button" data-v-move="${i}" data-dir="1" aria-label="Move variant down" ${i === variants.length - 1 ? 'disabled' : ''}>${icon('down')}</button></span></div>
        <button class="icon-btn icon-btn--danger variant-row__remove" type="button" data-v-del="${i}" aria-label="Remove variant ${i + 1}" title="Remove">${icon('trash')}</button>
      </div>`).join('') : `<div class="empty empty--inline">${icon('grid')}<span>No variants. This product has a single price and stock.</span></div>`;
    $('[data-stock-wrap]').hidden = !!variants.length;
    $('[data-stock-note]').hidden = !variants.length;
    $('[data-variant-total]').textContent = variants.reduce((s, v) => s + (Number(v.stock) || 0), 0);
  };
  renderVariants();

  view.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('[data-v]')) { variants[+t.dataset.v][t.dataset.k] = t.value; $('[data-variant-total]').textContent = variants.reduce((s, v) => s + (Number(v.stock) || 0), 0); dirty(); }
    if (t.matches('[data-option]')) { optionName = t.value; dirty(); }
  });
  view.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.matches('[data-add-variant]')) { variants.push({ id: null, name: '', sku: '', price: form.price.value || '', stock: 0 }); renderVariants(); dirty(); $(`#v-name-${variants.length - 1}`).focus(); }
    else if (t.matches('[data-v-del]')) { variants.splice(+t.dataset.vDel, 1); renderVariants(); dirty(); }
    else if (t.matches('[data-v-move]')) { const i = +t.dataset.vMove, j = i + Number(t.dataset.dir); [variants[i], variants[j]] = [variants[j], variants[i]]; renderVariants(); dirty(); }
    else if (t.matches('[data-delete]')) {
      if (!(await confirmBox({ title: 'Delete product?', message: `“${p.name}” will be removed from the shop. Past orders keep their details.`, confirm: 'Delete', danger: true }))) return;
      try { await api('DELETE', `/products/${id}`); setDirty(false); toast('Product deleted.'); refreshBadges(); navigate('/admin/products', { replace: true }); }
      catch (err) { toastError(err); }
    }
  });
  form.addEventListener('input', (e) => {
    if (e.target.closest('.image-tile')) return;
    dirty();
    if (e.target.name === 'name' && !slugTouched) form.slug.value = slugify(e.target.value);
    if (e.target.name === 'slug') slugTouched = true;
    e.target.closest('.field')?.classList.remove('is-invalid');
    syncPreviews();
  });
  form.addEventListener('change', (e) => {
    if (e.target.name === 'custom_available') $('[data-custom]').hidden = !e.target.checked;
    dirty();
  });

  /* ---------- Validation ---------- */
  const setError = (name, msg) => {
    const field = view.querySelector(`[data-field="${name}"]`);
    if (!field) return;
    field.classList.add('is-invalid');
    const box = field.querySelector('.field__error');
    box.textContent = msg; box.hidden = false;
  };
  const validate = () => {
    view.querySelectorAll('.field.is-invalid').forEach((x) => { x.classList.remove('is-invalid'); x.querySelector('.field__error').hidden = true; });
    const errors = [];
    if (!form.name.value.trim()) errors.push(['name', 'Give the product a name.']);
    const price = form.price.value;
    if (price === '' || !Number.isInteger(Number(price)) || Number(price) < 0) errors.push(['price', 'Enter a price in whole rupees.']);
    const cmp = form.compare_at_price.value;
    if (cmp !== '' && Number(cmp) <= Number(price)) errors.push(['compare_at_price', 'Should be higher than the price, or empty.']);
    if (!variants.length && (form.stock.value === '' || Number(form.stock.value) < 0)) errors.push(['stock', 'Stock can’t be negative.']);
    if (form.slug.value && !/^[a-z0-9-]+$/.test(form.slug.value)) errors.push(['slug', 'Use lowercase letters, numbers and dashes.']);
    errors.forEach(([k, msg]) => setError(k, msg));
    const badVariant = variants.findIndex((v) => !String(v.name).trim() || v.price === '' || Number(v.price) < 0);
    if (badVariant >= 0) errors.push(['variant', `Variant ${badVariant + 1} needs a name and a price.`]);
    return errors;
  };

  /* ---------- Save ---------- */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (uploader.busy) { toast('Please wait for the images to finish uploading.', 'error'); return; }
    const errors = validate();
    if (errors.length) {
      toast(errors.length === 1 ? errors[0][1] : `Please fix ${errors.length} highlighted fields.`, 'error');
      (view.querySelector('.field.is-invalid') || $('[data-variants]')).scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
    const body = {
      name: form.name.value, slug: form.slug.value || slugify(form.name.value),
      short_description: form.short_description.value, description: form.description.value,
      category_ids: [...form.querySelectorAll('[name=category_ids]:checked')].map((x) => x.value), price: num(form.price.value), compare_at_price: num(form.compare_at_price.value),
      sku: form.sku.value, stock: num(form.stock.value) ?? 0, stock_loaded: id ? p.stock : null, low_stock_threshold: num(form.low_stock_threshold.value),
      active: form.status.value === '1', featured: form.featured.checked, bestseller: form.bestseller.checked,
      material: form.material.value, size: form.size.value, weight: form.weight.value, finish: form.finish.value,
      care: form.care.value, production_time: form.production_time.value,
      custom_available: form.custom_available.checked, custom_type: form.custom_type.value,
      custom_instructions: form.custom_instructions.value, whatsapp_required: form.whatsapp_required.checked,
      seo_title: form.seo_title.value, seo_description: form.seo_description.value,
      images, variants: variants.map((v) => ({ id: v.id || null, option_name: optionName, name: v.name, sku: v.sku, price: num(v.price), stock: num(v.stock) ?? 0, stock_loaded: v.id ? (loadedStock.get(v.id) ?? null) : null })),
    };
    const btn = $('[data-save]');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const saved = await api(id ? 'PUT' : 'POST', id ? `/products/${id}` : '/products', body);
      setDirty(false);
      toast(id ? 'Product updated.' : 'Product created successfully.');
      refreshBadges();
      navigate(id ? location.pathname : `/admin/products/${saved.id}`, { replace: true });
    } catch (err) {
      if (/slug/i.test(err.message)) setError('slug', err.message);
      if (/SKU/.test(err.message)) setError('sku', err.message);
      toastError(err);
      btn.disabled = false; btn.textContent = id ? 'Save changes' : 'Create product';
    }
  });
  return () => setDirty(false);
}
