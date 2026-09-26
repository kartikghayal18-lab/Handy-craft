import { api, esc, inr, icon, PageHeader, ImageUploader, uploaderFor, toast, toastError, errorState, setDirty, setQuery, confirmBox } from '../app.js';

const TABS = [
  ['hero', 'Hero', 'dashboard'], ['categories_section', 'Shop Categories', 'categories'], ['featured_section', 'Featured Products', 'star'],
  ['process', 'How It’s Made', 'sparkle'], ['how_to_order', 'How To Order', 'orders'], ['about', 'About', 'info'], ['faq', 'FAQ', 'message'], ['contact', 'Contact', 'phone'],
];
const input = (name, label, value, max, attrs = '') => `<div class="field"><label for="c-${name}">${label}</label><input id="c-${name}" name="${name}" value="${esc(value ?? '')}" maxlength="${max}" ${attrs}></div>`;
const area = (name, label, value, max, rows = 3, attrs = '') => `<div class="field"><label for="c-${name}">${label}</label><textarea id="c-${name}" name="${name}" maxlength="${max}" rows="${rows}" ${attrs}>${esc(value ?? '')}</textarea></div>`;

export default async function content({ view, query }) {
  let data;
  try { data = await api('GET', '/content'); } catch (err) { view.innerHTML = errorState(err); return; }
  let tab = TABS.some(([k]) => k === query.get('tab')) ? query.get('tab') : 'hero';
  let dirty = false;
  const markDirty = (on = true) => { dirty = on; setDirty(on); const s = view.querySelector('[data-status]'); if (s) s.textContent = on ? 'Unsaved changes' : 'All changes saved'; };

  view.innerHTML = `
    ${PageHeader({ title: 'Website Content', text: 'Edit the words and images on your storefront.', actions: `<a class="btn btn--ghost" href="/" target="_blank" rel="noopener">${icon('external')} View shop</a>` })}
    <div class="cms">
      <nav class="cms__nav" aria-label="Content sections">${TABS.map(([k, l, ic]) => `<button type="button" class="cms__tab" data-tab="${k}" aria-current="${k === tab}">${icon(ic)}<span>${l}</span></button>`).join('')}</nav>
      <section class="card cms__panel" data-panel></section>
    </div>`;
  const panel = view.querySelector('[data-panel]');

  /* ---------- Steps editor (How It's Made / How To Order) ---------- */
  const stepsEditor = (steps, max, min = 1) => `
    <div class="fields" data-steps>${steps.map((s, i) => `
      <div class="step-card" data-step>
        <div class="step-card__head"><span class="step-card__num">${String(i + 1).padStart(2, '0')}</span>
          <span class="actions">
            <button class="icon-btn" type="button" data-step-move="${i}" data-dir="-1" aria-label="Move step up" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button>
            <button class="icon-btn" type="button" data-step-move="${i}" data-dir="1" aria-label="Move step down" ${i === steps.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
            <button class="icon-btn icon-btn--danger" type="button" data-step-del="${i}" aria-label="Remove step" ${steps.length <= min ? 'disabled' : ''}>${icon('trash')}</button>
          </span></div>
        <div class="field"><label for="st-t-${i}">Title</label><input id="st-t-${i}" data-step-title value="${esc(s.title)}" maxlength="60" required></div>
        <div class="field"><label for="st-x-${i}">Text</label><textarea id="st-x-${i}" data-step-text rows="2" maxlength="260">${esc(s.text)}</textarea></div>
      </div>`).join('')}
      ${steps.length < max ? `<div><button class="btn btn--ghost btn--sm" type="button" data-step-add>${icon('plus')} Add step</button></div>` : ''}
    </div>`;
  const readSteps = () => [...panel.querySelectorAll('[data-step]')].map((el) => ({ title: el.querySelector('[data-step-title]').value, text: el.querySelector('[data-step-text]').value }));
  const readFaq = () => [...panel.querySelectorAll('[data-q]')].map((el) => ({ q: el.querySelector('[data-faq-q]').value, a: el.querySelector('[data-faq-a]').value }));

  /* ---------- Live previews ---------- */
  const preview = () => {
    const box = panel.querySelector('[data-preview]');
    const form = panel.querySelector('[data-form]');
    if (!box || !form) return;
    const v = Object.fromEntries(new FormData(form));
    if (tab === 'hero') box.innerHTML = `<div class="pv-hero">
      <div><p class="pv-eyebrow">${esc(v.eyebrow)}</p><p class="pv-title">${esc(v.line1)}<br>${esc(v.line2)}<br><span class="pv-script">${esc(v.script)}</span></p>
      <p class="pv-lede">${esc(v.lede)}</p><p class="pv-ctas"><span class="pv-btn">${esc(v.primary_cta)} →</span><span class="pv-btn pv-btn--ghost">▶ ${esc(v.secondary_cta)}</span></p></div>
      <img src="${esc(heroImage[0]?.url || '')}" alt="" ${heroImage.length ? '' : 'hidden'}></div>`;
    if (tab === 'process' || tab === 'how_to_order') {
      const steps = readSteps();
      box.innerHTML = `<div class="pv-section"><p class="pv-eyebrow">${esc(v.eyebrow)}</p><p class="pv-h2">${esc(v.title)} <em>${esc(v.title_accent)}</em></p><p class="pv-lede">${esc(v.lede)}</p>
        <ol class="pv-steps">${steps.map((s, i) => `<li><span>${String(i + 1).padStart(2, '0')}</span><strong>${esc(s.title || 'Untitled step')}</strong><small>${esc(s.text)}</small></li>`).join('')}</ol>
        ${tab === 'how_to_order' ? `<p class="pv-cta">${esc(v.cta_title)} <em>${esc(v.cta_accent)}</em><br><span class="pv-btn">${esc(v.cta_label)} →</span></p>` : ''}</div>`;
    }
  };

  let heroImage = [];
  let aboutImage = [];
  const save = '<div class="cms__save"><span class="muted" data-status>All changes saved</span><button class="btn btn--primary" type="submit" data-save>Save changes</button></div>';

  const render = async () => {
    setQuery({ tab });
    markDirty(false);
    view.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.tab === tab)));
    const c = data[tab];
    if (tab === 'hero') {
      heroImage = c.image_url ? [{ url: c.image_url, alt: 'Hero product' }] : [];
      panel.innerHTML = `<form class="cms__split" data-form novalidate>
        <div class="fields">
          <h2 class="section-title">Hero</h2>
          ${input('eyebrow', 'Eyebrow', c.eyebrow, 60, 'required')}
          <div class="fields-2">${input('line1', 'Heading line 1', c.line1, 40, 'required')}${input('line2', 'Heading line 2', c.line2, 40, 'required')}</div>
          <div class="fields-2">${input('script', 'Script word <span>handwritten accent</span>', c.script, 30, 'required')}</div>
          ${area('lede', 'Subheading', c.lede, 220, 2, 'required')}
          <div class="fields-2">${input('primary_cta', 'Primary button', c.primary_cta, 30, 'required')}${input('secondary_cta', 'Secondary button', c.secondary_cta, 30, 'required')}</div>
          <div class="field"><span class="label">Hero image</span><div data-hero-image></div></div>
          ${save}
        </div>
        <div class="cms__preview"><p class="cms__preview-label">${icon('eye')} Preview</p><div data-preview></div></div>
      </form>`;
      ImageUploader(panel.querySelector('[data-hero-image]'), { images: heroImage, single: true, upload: uploaderFor('content'), altText: false, onChange: (l) => { heroImage = l; markDirty(); preview(); } });
    } else if (tab === 'process' || tab === 'how_to_order') {
      panel.innerHTML = `<form class="cms__split" data-form novalidate>
        <div class="fields">
          <h2 class="section-title">${tab === 'process' ? 'How It’s Made' : 'How To Order'}</h2>
          ${input('eyebrow', 'Eyebrow', c.eyebrow, 60, 'required')}
          <div class="fields-2">${input('title', 'Heading', c.title, 40, 'required')}${input('title_accent', 'Heading accent <span>italic</span>', c.title_accent, 40, 'required')}</div>
          ${area('lede', 'Subheading', c.lede, 200, 2, 'required')}
          <h3 class="subhead">Steps</h3>
          ${tab === 'process' ? '<p class="muted" style="margin:-6px 0 0">Each step keeps its photo in order: idea, design, handcraft, delivery.</p>' : ''}
          ${stepsEditor(c.steps, tab === 'process' ? 4 : 5)}
          ${tab === 'how_to_order' ? `<h3 class="subhead">Closing call to action</h3><div class="fields-3">${input('cta_title', 'Heading', c.cta_title, 60, 'required')}${input('cta_accent', 'Accent', c.cta_accent, 60, 'required')}${input('cta_label', 'Button', c.cta_label, 40, 'required')}</div>` : ''}
          ${save}
        </div>
        <div class="cms__preview"><p class="cms__preview-label">${icon('eye')} Preview</p><div data-preview></div></div>
      </form>`;
    } else if (tab === 'categories_section') {
      const cats = (await api('GET', '/categories')).rows;
      panel.innerHTML = `<form class="fields" data-form novalidate>
        <h2 class="section-title">Shop Categories</h2>
        ${input('eyebrow', 'Eyebrow', c.eyebrow, 60, 'required')}
        <div class="fields-2">${input('title', 'Heading', c.title, 40, 'required')}${input('title_accent', 'Heading accent <span>italic</span>', c.title_accent, 40, 'required')}</div>
        ${area('lede', 'Subheading', c.lede, 200, 2)}
        <h3 class="subhead">Shown in this order</h3>
        <ol class="mini-list">${cats.filter((x) => !x.parent_id).map((x) => `<li><img src="${esc(x.image_url)}" alt=""><span><strong>${esc(x.name)}</strong><small class="muted">${x.child_count} subcategories · ${x.active_count} live products</small></span>${x.active ? '<span class="pill tone-ok">Live</span>' : '<span class="pill tone-muted">Hidden</span>'}</li>`).join('')}</ol>
        <p><a class="link" href="/admin/categories">Reorder or edit categories ${icon('arrow')}</a></p>
        ${save}</form>`;
    } else if (tab === 'featured_section') {
      const prods = [];
      let page = 1, pages = 1;
      do { const d = await api('GET', `/products?filter=active&sort=name&page=${page}`); prods.push(...d.rows); pages = d.pages; page++; } while (page <= pages);
      panel.innerHTML = `<form class="fields" data-form novalidate>
        <h2 class="section-title">Featured Products</h2>
        <div class="fields-2">${input('title', 'Section heading', c.title, 60, 'required')}
          <div class="field"><label for="c-limit">Pieces to show</label><select id="c-limit" name="limit">${[3, 4, 6, 8].map((n) => `<option${Number(c.limit) === n ? ' selected' : ''}>${n}</option>`).join('')}</select></div></div>
        ${area('lede', 'Subheading', c.lede, 200, 2)}
        <h3 class="subhead">Choose featured products <span class="muted" data-feat-count></span></h3>
        <ul class="pick-list">${prods.map((p) => `<li><label><input type="checkbox" data-feature="${p.id}"${p.featured ? ' checked' : ''}><img src="${esc(p.image)}" alt=""><span><strong>${esc(p.name)}</strong><small class="muted">${esc(p.category_name)} · ${inr(p.price)}</small></span></label></li>`).join('')}</ul>
        ${save}</form>`;
      const count = () => { panel.querySelector('[data-feat-count]').textContent = `(${panel.querySelectorAll('[data-feature]:checked').length} selected)`; };
      count();
      panel.addEventListener('change', (e) => { if (e.target.matches('[data-feature]')) count(); });
    } else if (tab === 'about') {
      aboutImage = c.image_url ? [{ url: c.image_url, alt: '' }] : [];
      panel.innerHTML = `<form class="fields" data-form novalidate>
        <h2 class="section-title">About</h2>
        ${input('title', 'Title', c.title, 80, 'required')}
        ${area('body', 'Your story', c.body, 5000, 10)}
        <div class="field"><span class="label">Photo</span><div data-about-image></div></div>
        ${save}</form>`;
      ImageUploader(panel.querySelector('[data-about-image]'), { images: aboutImage, single: true, upload: uploaderFor('content'), altText: false, onChange: (l) => { aboutImage = l; markDirty(); } });
    } else if (tab === 'faq') {
      panel.innerHTML = `<form class="fields" data-form novalidate>
        <h2 class="section-title">FAQ</h2>
        <div class="fields" data-faq>${c.items.length ? c.items.map((x, i) => `
          <details class="faq-item" data-q open>
            <summary><span class="step-card__num">Q${i + 1}</span> <span class="faq-item__q">${esc(x.q || 'New question')}</span>
              <span class="actions"><button class="icon-btn" type="button" data-faq-move="${i}" data-dir="-1" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button>
              <button class="icon-btn" type="button" data-faq-move="${i}" data-dir="1" aria-label="Move down" ${i === c.items.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
              <button class="icon-btn icon-btn--danger" type="button" data-faq-del="${i}" aria-label="Remove question">${icon('trash')}</button></span></summary>
            <div class="field"><label for="q-${i}">Question</label><input id="q-${i}" data-faq-q value="${esc(x.q)}" maxlength="200" required></div>
            <div class="field"><label for="a-${i}">Answer</label><textarea id="a-${i}" data-faq-a rows="3" maxlength="1000" required>${esc(x.a)}</textarea></div>
          </details>`).join('') : `<div class="empty empty--inline">${icon('message')}<span>No questions yet.</span></div>`}</div>
        <div><button class="btn btn--ghost btn--sm" type="button" data-faq-add>${icon('plus')} Add question</button></div>
        ${save}</form>`;
    } else if (tab === 'contact') {
      panel.innerHTML = `<form class="fields" data-form novalidate>
        <h2 class="section-title">Contact</h2>
        <div class="fields-2">${input('email', 'Email', c.email, 160, 'type="email"')}${input('phone', 'Phone', c.phone, 20, 'type="tel"')}</div>
        ${area('address', 'Studio address', c.address, 300, 2)}
        ${input('hours', 'Opening hours', c.hours, 120, 'placeholder="e.g. Mon–Sat, 10am–7pm"')}
        ${area('tagline', 'Footer tagline', c.tagline, 200, 2)}
        <p class="muted" style="margin:0">The WhatsApp number is set on the <a class="link" href="/admin/whatsapp">WhatsApp</a> page.</p>
        ${save}</form>`;
    }
    preview();
  };

  /* ---------- Events ---------- */
  view.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.matches('[data-tab]')) {
      if (t.dataset.tab === tab) return;
      if (dirty && !(await confirmBox({ title: 'Discard changes?', message: 'You have unsaved changes in this section.', confirm: 'Discard', danger: true }))) return;
      tab = t.dataset.tab;
      return render();
    }
    const keep = () => { const f = panel.querySelector('[data-form]'); const v = f ? Object.fromEntries(new FormData(f)) : {}; Object.assign(data[tab], v); };
    if (t.matches('[data-step-add]')) { keep(); data[tab].steps = [...readSteps(), { title: '', text: '' }]; await render(); markDirty(); panel.querySelector('[data-step]:last-of-type input')?.focus(); }
    if (t.matches('[data-step-del]')) { keep(); const s = readSteps(); s.splice(+t.dataset.stepDel, 1); data[tab].steps = s; await render(); markDirty(); }
    if (t.matches('[data-step-move]')) { keep(); const s = readSteps(); const i = +t.dataset.stepMove, j = i + Number(t.dataset.dir); [s[i], s[j]] = [s[j], s[i]]; data[tab].steps = s; await render(); markDirty(); }
    if (t.matches('[data-faq-add]')) { data.faq.items = [...readFaq(), { q: '', a: '' }]; await render(); markDirty(); panel.querySelector('[data-q]:last-of-type input')?.focus(); }
    if (t.matches('[data-faq-del]')) { e.preventDefault(); const f = readFaq(); f.splice(+t.dataset.faqDel, 1); data.faq.items = f; await render(); markDirty(); }
    if (t.matches('[data-faq-move]')) { e.preventDefault(); const f = readFaq(); const i = +t.dataset.faqMove, j = i + Number(t.dataset.dir); [f[i], f[j]] = [f[j], f[i]]; data.faq.items = f; await render(); markDirty(); }
  });
  view.addEventListener('input', (e) => {
    if (!e.target.closest('[data-form]')) return;
    markDirty();
    if (e.target.matches('[data-faq-q]')) e.target.closest('[data-q]').querySelector('.faq-item__q').textContent = e.target.value || 'New question';
    preview();
  });
  view.addEventListener('change', (e) => { if (e.target.closest('[data-form]')) markDirty(); });
  view.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-form]');
    if (!f) return;
    e.preventDefault();
    if (!f.reportValidity()) { toast('Please fill in the highlighted fields.', 'error'); return; }
    const body = { ...data[tab], ...Object.fromEntries(new FormData(f)) };
    if (tab === 'process' || tab === 'how_to_order') body.steps = readSteps();
    if (tab === 'faq') body.items = readFaq();
    if (tab === 'hero') body.image_url = heroImage[0]?.url || '';
    if (tab === 'about') body.image_url = aboutImage[0]?.url || '';
    const btn = f.querySelector('[data-save]');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      if (tab === 'featured_section') {
        const boxes = [...f.querySelectorAll('[data-feature]')];
        await Promise.all(boxes.filter((b) => b.defaultChecked !== b.checked).map((b) => api('PATCH', `/products/${b.dataset.feature}`, { featured: b.checked })));
        boxes.forEach((b) => { b.defaultChecked = b.checked; });
        body.limit = Number(body.limit);
      }
      data[tab] = await api('PUT', `/content/${tab}`, body);
      markDirty(false);
      toast(`${TABS.find(([k]) => k === tab)[1]} saved.`);
    } catch (err) { toastError(err); }
    btn.disabled = false; btn.textContent = 'Save changes';
  });
  await render();
  return () => setDirty(false);
}
