import { useMemo, useRef } from 'react';
import FloweringBranch from './FloweringBranch.jsx';
import Icon from './Icon.jsx';
import PetalLayer from './PetalLayer.jsx';
import { Link } from '../router.jsx';
import { useStore } from '../data/store.jsx';
import { createPetals } from '../motion/petals.js';
import { useScrollScene } from '../motion/useScrollScene.js';
import { useMedia } from '../motion/useMedia.js';
import './shop-by-category.css';

// The blossom branch photographed in the corner, in its own pixel space; points are the open flowers.
const BRANCH = {
  width: 235,
  blossoms: [
    [80, 120], [155, 100], [205, 148], [160, 75], [195, 210], [135, 255], [100, 240], [40, 85], [180, 25], [215, 55], [95, 40], [150, 175],
  ].map(([x, y]) => ({ x, y, r: 12 })),
};

// Deliberately gentle: the cards should barely drift.
const DEPTH = { shadow: 0.22, branch: -0.05, grid: 0.025, bokeh: -0.07 };
const PETALS = { desktop: 28, tablet: 18, mobile: 10 };

export function Ornament() {
  return (
    <div className="shop-ornament" aria-hidden="true">
      <span />
      <svg viewBox="-12 -12 24 24" width="22" height="22">
        {[0, 72, 144, 216, 288].map(a => <ellipse key={a} cx="0" cy="-5.6" rx="3.4" ry="5" transform={`rotate(${a})`} />)}
        <circle r="2" />
      </svg>
      <span />
    </div>
  );
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const gifts = n => `${n} ${n === 1 ? 'gift' : 'gifts'}`;

// A main category (Shop by Person, Occasions, Custom Gifts…): its photo, name, description and "View All",
// with three of its subcategories underneath — or three of its products when it has no subcategories.
function CategoryCard({ category, index }) {
  const { subsOf, productsIn, pictureOf, onView } = useStore();
  const href = `/shop/${category.slug}`;
  const titleId = `category-${category.slug}`;
  const subs = subsOf(category).filter(sub => productsIn(sub).length).slice(0, 3);
  const products = subs.length ? [] : productsIn(category).slice(0, 3);
  return (
    <li className="category-card" aria-labelledby={titleId} data-reveal style={{ '--reveal-delay': `${(index % 3) * 90}ms` }}>
      <Link className="category-media" to={href} tabIndex={-1} aria-hidden="true">
        <img src={pictureOf(category)} alt="" width="586" height="352" loading="lazy" decoding="async" data-parallax="0.12" />
      </Link>
      <div className="category-body">
        <div className="category-text">
          <h3 id={titleId}><Link to={href}>{category.name}</Link></h3>
          {category.description && <p>{category.description}</p>}
        </div>
        <Link className="category-view-all" to={href} aria-label={`View all: ${category.name}`}>
          View All <Icon name="arrow" size={15} />
        </Link>
      </div>
      {(subs.length > 0 || products.length > 0) && (
        <ul className="category-products">
          {subs.map(sub => (
            <li key={sub.id}>
              <Link className="product-mini" to={`${href}?sub=${sub.slug}`}>
                <span className="product-mini-media"><img src={pictureOf(sub)} alt="" loading="lazy" decoding="async" /></span>
                <span className="product-mini-name">{sub.name}</span>
                <span className="product-mini-price">{gifts(productsIn(sub).length)}</span>
              </Link>
            </li>
          ))}
          {products.map(product => (
            <li key={product.id}>
              <button type="button" className="product-mini" onClick={() => onView(product)}>
                <span className="product-mini-media"><img src={product.image} alt="" loading="lazy" decoding="async" /></span>
                <span className="product-mini-name">{product.name}</span>
                <span className="product-mini-price">{inr.format(product.price)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Shop by Category. As its own page it starts at the top; under the homepage hero (`embedded`)
 * its petal timeline starts as it scrolls into view.
 */
export default function ShopByCategory({ embedded = false }) {
  const { mains, content } = useStore();
  const intro = content.categories_section;
  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)');
  const isDesktop = useMedia('(min-width: 1100px)');
  const isTablet = useMedia('(min-width: 761px)');
  const budget = isDesktop ? PETALS.desktop : isTablet ? PETALS.tablet : PETALS.mobile;
  const petals = useMemo(() => createPetals(budget, {
    anchors: BRANCH.blossoms, allowNear: isTablet, preFalling: !embedded && isTablet,
    // As its own page there is only a little scroll, so the fall is compressed to fit it.
    ...(embedded ? {} : { detachWindow: 200, speedScale: 2.2 }),
  }), [budget, isTablet, embedded]);

  const section = useRef(null);
  const shadow = useRef(null);
  const branchAnchor = useRef(null);
  const branch = useRef(null);
  const grid = useRef(null);
  const bokeh = useRef(null);
  const petalEls = useRef([]);
  const layers = useMemo(() => [
    { ref: shadow, rate: DEPTH.shadow },
    { ref: branch, rate: DEPTH.branch, sway: 1 },
    { ref: grid, rate: DEPTH.grid },
    { ref: bokeh, rate: DEPTH.bokeh },
  ], []);

  useScrollScene({
    containerRef: section, anchorRef: branchAnchor, scene: BRANCH, anchorRate: DEPTH.branch,
    layers, petals, petalEls, enabled: !reducedMotion, startAt: embedded ? 'enter' : 'top', range: 1.2,
  });

  const Heading = embedded ? 'h2' : 'h1';

  return (
    <section className={`shop ${embedded ? 'is-embedded' : ''}`} ref={section} aria-labelledby="shop-title" id="shop">
      {/* Background: warm plaster with soft leaf shadows from a window. Slowest layer. */}
      <div className="shop-light" aria-hidden="true">
        <div className="shop-shadow" ref={shadow}><FloweringBranch silhouette /></div>
      </div>

      {/* The flowering branch reaching in from the top-right corner */}
      <div className="shop-branch-anchor" ref={branchAnchor} aria-hidden="true">
        <div className="shop-branch" ref={branch}><img src="/images/branch-corner.webp" width="470" height="600" alt="" /></div>
      </div>

      <div className="shop-inner">
        <header className="shop-header" data-reveal>
          <p className="eyebrow">{intro.eyebrow}</p>
          <Heading id="shop-title">{intro.title} <em>{intro.title_accent}</em></Heading>
          <Ornament />
          {intro.lede && <p className="shop-lede">{intro.lede}</p>}
        </header>

        <div ref={grid} className="shop-grid-motion">
          <ul className="shop-grid">
            {mains.map((category, i) => <CategoryCard key={category.id} category={category} index={i} />)}
          </ul>
        </div>
      </div>

      {/* Foreground: blossom close to the lens, bottom corners */}
      <div className="shop-bokeh" ref={bokeh} aria-hidden="true">
        <img className="shop-bokeh-left" src="/images/studio-bokeh.webp" width="368" height="888" alt="" loading="lazy" />
        <img className="shop-bokeh-right" src="/images/studio-bokeh.webp" width="368" height="888" alt="" loading="lazy" />
      </div>

      {!reducedMotion && <PetalLayer petals={petals} petalEls={petalEls} keyPrefix={`shop-${budget}`} />}
    </section>
  );
}
