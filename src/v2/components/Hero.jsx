import { useMemo, useRef } from 'react';
import FloweringBranch from './FloweringBranch.jsx';
import Icon from './Icon.jsx';
import PetalLayer from './PetalLayer.jsx';
import { Link } from '../router.jsx';
import { useStore } from '../data/store.jsx';
import { createPetals, PETAL_BUDGET } from '../motion/petals.js';
import { useScrollScene } from '../motion/useScrollScene.js';
import { useMedia } from '../motion/useMedia.js';
import './hero.css';

// How much each layer is held back (+) or pushed ahead (-) of the page per px scrolled.
const DEPTH = { shadow: 0.3, scene: 0.08, copy: 0.05, sprig: -0.08 };

// The studio photograph (mug, frame, vase of blossom, linen on a stone tabletop), in its own pixel space.
// Blossom points are where the flowers sit in the photo, so falling petals start from real flowers.
export const SCENE = {
  width: 873,
  height: 716,
  blossoms: [
    [721, 137], [778, 103], [835, 46], [675, 126], [732, 183], [824, 171], [767, 240], [801, 286], [709, 263],
    [258, 434], [298, 423], [355, 480], [355, 560], [241, 389], [332, 377],
  ].map(([x, y]) => ({ x, y, r: 14 })),
};

const PROMISES = [
  { icon: 'heart', label: 'Handmade', detail: 'with care' },
  { icon: 'truck', label: 'Ships', detail: 'across India' },
  { icon: 'gift', label: 'Free', detail: 'personalization' },
  { icon: 'leaf', label: 'Not mass', detail: 'produced' },
];

export default function Hero() {
  const text = useStore().content.hero;
  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)');
  const isDesktop = useMedia('(min-width: 1100px)');
  const isTablet = useMedia('(min-width: 761px)');
  const budget = isDesktop ? PETAL_BUDGET.desktop : isTablet ? PETAL_BUDGET.tablet : PETAL_BUDGET.mobile;
  // On phones the copy sits above the scene, so only petals born on the flowers (which fall away from the text) are used.
  const petals = useMemo(() => createPetals(budget, { anchors: SCENE.blossoms, allowNear: isTablet }), [budget, isTablet]);

  const hero = useRef(null);
  const shadow = useRef(null);
  const product = useRef(null);
  const sceneAnchor = useRef(null);
  const copy = useRef(null);
  const sprig = useRef(null);
  const petalEls = useRef([]);
  const layers = useMemo(() => [
    { ref: shadow, rate: DEPTH.shadow },
    { ref: product, rate: DEPTH.scene },
    { ref: copy, rate: DEPTH.copy, fade: [0.22, 0.6, 0.85] },
    { ref: sprig, rate: DEPTH.sprig, sway: 1.4 },
  ], []);

  useScrollScene({ containerRef: hero, anchorRef: sceneAnchor, scene: SCENE, anchorRate: DEPTH.scene, layers, petals, petalEls, enabled: !reducedMotion });

  return (
    <section className="hero" ref={hero} aria-labelledby="hero-title">
      {/* Background: the studio wall in morning light, with a soft branch shadow on the plaster */}
      <div className="hero-light" aria-hidden="true">
        <div className="hero-shadow" ref={shadow}><FloweringBranch silhouette /></div>
      </div>
      <div className="hero-table" aria-hidden="true" />

      <div className="hero-inner">
        <div className="hero-copy" ref={copy}>
          <p className="eyebrow hero-label">{text.eyebrow.split('·').map((part, i) => <span key={i}>{i > 0 && <i aria-hidden="true">♥</i>} {part.trim()}</span>)}</p>
          <h1 id="hero-title">{text.line1}<br />{text.line2}<br /><em>{text.script}</em></h1>
          <p className="hero-lede">{text.lede}</p>
          <div className="hero-actions">
            <Link className="button button-primary" to="/shop">{text.primary_cta} <Icon name="arrow" size={18} /></Link>
            <Link className="button button-quiet" to="/gifts">{text.secondary_cta}</Link>
          </div>
        </div>
      </div>

      {/* Midground: the photographed studio scene. The outer box is never transformed so petals can measure it. */}
      <figure className="hero-scene" ref={sceneAnchor}>
        <div className="hero-scene-motion" ref={product}>
          <img
            src="/images/studio-scene.webp"
            srcSet="/images/studio-scene-sm.webp 764w, /images/studio-scene.webp 1528w"
            sizes="(max-width: 900px) 100vw, 62vw"
            width="1528" height="1253"
            alt="A personalized wooden photo frame reading “You, Me, Always”, a handmade ceramic mug that says “good days”, a stoneware vase of pink blossom and soft linen on a stone tabletop"
            fetchPriority="high"
          />
        </div>
      </figure>

      <ul className="hero-promises" aria-label="Why Forever Handy">
        {PROMISES.map(item => <li key={item.label}><Icon name={item.icon} size={22} /><span>{item.label} <span>{item.detail}</span></span></li>)}
      </ul>
      <a className="hero-scroll" href="#hero-end"><span>Scroll to explore</span><i aria-hidden="true" /></a>

      {/* Foreground: blossom right by the lens, out of focus */}
      <div className="hero-sprig" ref={sprig} aria-hidden="true">
        <img src="/images/studio-bokeh.webp" width="368" height="888" alt="" />
      </div>

      <span id="hero-end" />
      {/* Foreground: petals in screen space, so they can keep falling past the hero */}
      {!reducedMotion && <PetalLayer petals={petals} petalEls={petalEls} keyPrefix={budget} />}
    </section>
  );
}
