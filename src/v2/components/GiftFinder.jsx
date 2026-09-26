import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { Ornament } from './ShopByCategory.jsx';
import { Link } from '../router.jsx';
import { useStore } from '../data/store.jsx';
import './gift-finder.css';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const gifts = n => `${n} ${n === 1 ? 'gift' : 'gifts'}`;

/**
 * One main category (Shop by Person, Occasions, Custom Gifts, …) as a page: its subcategories are the
 * picks, and the gifts below follow the choice. `slug="all"` is every gift, with the main categories as picks.
 * The choice is kept in the address (?sub=…) so it survives a refresh and can be shared.
 */
export default function GiftFinder({ slug }) {
  const { products, catalogState, mains, subsOf, productsIn, pictureOf, bySlug, onView } = useStore();
  const all = slug === 'all';
  const main = all ? null : bySlug(slug);
  const options = (all ? mains : main ? subsOf(main) : []).filter(c => productsIn(c).length);
  const params = new URLSearchParams(window.location.search);
  const [selected, setSelected] = useState(() => params.get('sub') || 'all');
  const [query, setQuery] = useState('');
  const search = useRef(null);
  useEffect(() => { if (params.get('search')) search.current?.focus(); }, []);   // opened from the search icon

  const choose = id => {
    setSelected(id);
    window.history.replaceState({}, '', id === 'all' ? window.location.pathname : `${window.location.pathname}?sub=${id}`);
  };

  // Keep the chosen pick in view in the swipeable row on phones (only the row scrolls, not the page).
  const picks = useRef(null);
  useEffect(() => {
    const row = picks.current;
    const pick = row?.querySelector('.is-selected');
    if (!pick || row.scrollWidth <= row.clientWidth) return;
    row.scrollTo({ left: Math.max(0, pick.offsetLeft - (row.clientWidth - pick.offsetWidth) / 2), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [selected, options.length]);

  if (!all && !main && !catalogState.loading) {
    return (
      <main className="not-built">
        <p className="eyebrow">Not found</p>
        <h1>We couldn’t find that collection.</h1>
        <Link className="button button-quiet" to="/shop">Back to Shop by Category</Link>
      </main>
    );
  }

  const option = options.find(o => o.slug === selected);
  const base = option ? productsIn(option) : all ? products : main ? productsIn(main) : [];
  const q = query.trim().toLowerCase();
  const shown = q ? base.filter(p => [p.name, p.type, ...(p.categories || [])].join(' ').toLowerCase().includes(q)) : base;
  const title = all ? 'All gifts' : main?.name || '';
  const words = title.split(' ');

  return (
    <section className="finder" aria-labelledby="finder-title">
      <div className="finder-inner">
        <header className="finder-header" data-reveal>
          <p className="eyebrow">{all ? 'Everything we make' : 'Find the perfect gift'}</p>
          <h1 id="finder-title">{all ? <>All <em>Gifts</em></> : <>{words.slice(0, -1).join(' ')} <em>{words.at(-1)}</em></>}</h1>
          <Ornament />
          {(all || main?.description) && <p className="finder-lede">{all ? 'Every handmade, personalized gift in the studio.' : main.description}</p>}
        </header>

        {options.length > 0 && (
          <div className="finder-picks" ref={picks} role="group" aria-label={`Choose within ${title}`} data-reveal>
            {[{ id: 'all', slug: 'all', name: all ? 'Everything' : `All ${title}` }, ...options].map(o => (
              <button key={o.slug} type="button" className={`finder-pick ${selected === o.slug ? 'is-selected' : ''}`} aria-pressed={selected === o.slug} onClick={() => choose(o.slug)}>
                <span className="finder-pick-icon">{o.id === 'all' ? <Icon name="grid" size={26} /> : <img src={pictureOf(o)} alt="" loading="lazy" />}</span>
                <span className="finder-pick-label">{o.name}</span>
              </button>
            ))}
          </div>
        )}

        <div className="finder-results-head" aria-live="polite">
          <div>
            <h2>{option ? option.name : title}</h2>
            {option?.description && <p>{option.description}</p>}
          </div>
          <span className="finder-count">{catalogState.loading ? 'Loading…' : gifts(shown.length)}</span>
        </div>
        <label className="finder-search">
          <Icon name="search" size={18} />
          <input ref={search} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search gifts" aria-label="Search gifts" />
        </label>

        {catalogState.error ? (
          <div className="finder-empty"><p>We couldn’t load the gifts. Please check your connection.</p><button className="button button-quiet" onClick={catalogState.retry}>Try again</button></div>
        ) : !catalogState.loading && !shown.length ? (
          <div className="finder-empty"><p>{q ? 'No gifts match that search.' : 'New gifts are on their way here.'}</p>{(q || option) && <button className="button button-quiet" onClick={() => { setQuery(''); choose('all'); }}>See all</button>}</div>
        ) : (
          <ul className="finder-grid" key={`${selected}-${q}`}>
            {shown.map((product, i) => (
              <li key={product.id} style={{ '--i': Math.min(i, 8) }}>
                <button type="button" className="finder-product" onClick={() => onView(product)}>
                  <span className="finder-product-media"><img src={product.image} alt="" loading="lazy" decoding="async" /></span>
                  {product.categories?.[0] && <span className="finder-product-category">{product.categories[0]}</span>}
                  <span className="finder-product-name">{product.name}</span>
                  <span className="finder-product-price">
                    {inr.format(product.price)}
                    {product.regularPrice > product.price && <s>{inr.format(product.regularPrice)}</s>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
