import { useEffect, useMemo, useRef } from 'react';
import PetalLayer from './PetalLayer.jsx';
import { useMedia } from '../motion/useMedia.js';

// A light, endless fall of petals behind every page, so the blossom never "runs out" as you scroll.
// It falls on its own over time; scrolling carries it along a little (near petals more than far ones) for depth.
// On the homepage it fades in below the hero, where the hero's and the shop's own petals give way.

const DEPTHS = {
  far: { scale: [0.6, 0.78], speed: [26, 38], parallax: 0.12, opacity: [0.5, 0.66] },
  mid: { scale: [0.95, 1.25], speed: [38, 58], parallax: 0.28, opacity: [0.78, 0.92] },
  near: { scale: [1.5, 1.9], speed: [62, 84], parallax: 0.5, opacity: [0.7, 0.82] },
};
const PATTERN = ['mid', 'far', 'mid', 'far', 'mid', 'near', 'far', 'mid'];
const between = ([a, b]) => a + Math.random() * (b - a);

function makePetals(count) {
  return Array.from({ length: count }, (_, i) => {
    const depth = PATTERN[i % PATTERN.length];
    const d = DEPTHS[depth];
    const flower = depth !== 'near' && i % 6 === 4;
    return {
      depth,
      flower,
      tone: ['a', 'b', 'c', 'd', 'e'][Math.floor(Math.random() * 5)],
      x: Math.random(),
      y: Math.random(), // share of the screen height to start at, so the screen is never empty on arrival
      scale: between(d.scale) * (flower ? 0.85 : 1),
      speed: between(d.speed) * (flower ? 1.15 : 1),
      parallax: d.parallax,
      opacity: between(d.opacity),
      drift: (Math.random() < 0.7 ? -1 : 1) * between([4, 16]),
      swayAmp: between([12, 30]) * (depth === 'near' ? 1.5 : depth === 'far' ? 0.6 : 1),
      swayPeriod: between([4.5, 8]),
      spin: (Math.random() < 0.5 ? -1 : 1) * between([8, flower ? 20 : 40]),
      rot0: Math.random() * 360,
      flipAmp: flower ? between([12, 26]) : between([35, 70]),
      flipPeriod: between([2.8, 5]),
      phase: Math.random() * Math.PI * 2,
    };
  });
}

export default function AmbientPetals({ quietTop = false }) {
  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)');
  const isDesktop = useMedia('(min-width: 1100px)');
  const isTablet = useMedia('(min-width: 761px)');
  const count = isDesktop ? 18 : isTablet ? 14 : 11;
  const petals = useMemo(() => makePetals(count), [count]);
  const petalEls = useRef([]);
  const layer = useRef(null);

  useEffect(() => {
    if (reducedMotion) return undefined;
    let vw = window.innerWidth;
    let vh = window.innerHeight;
    const state = petals.map(p => ({ x: p.x * vw, y: p.y * vh, t: p.phase }));
    let lastScroll = window.scrollY;
    let last = performance.now();
    let raf = 0;
    const onResize = () => { vw = window.innerWidth; vh = window.innerHeight; };

    const tick = now => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const scrollY = window.scrollY;
      const ds = Math.max(-120, Math.min(120, scrollY - lastScroll));
      lastScroll = scrollY;

      if (layer.current) {
        const fade = quietTop ? Math.min(1, Math.max(0, (scrollY - vh * 0.9) / (vh * 0.8))) : 1;
        layer.current.style.opacity = fade.toFixed(3);
      }

      petals.forEach((p, i) => {
        const s = state[i];
        s.t += dt;
        s.y += p.speed * dt - ds * p.parallax;
        s.x += p.drift * dt;
        // Off the bottom: start again above the screen at a new spot. Pushed off the top by a fast scroll up: come back in below.
        if (s.y > vh + 50) { s.y = -50 - Math.random() * 120; s.x = Math.random() * vw; }
        else if (s.y < -220) { s.y = vh + 40; s.x = Math.random() * vw; }
        if (s.x < -60) s.x = vw + 40;
        else if (s.x > vw + 60) s.x = -40;

        const el = petalEls.current[i];
        if (!el) return;
        const wave = (s.t / p.swayPeriod) * Math.PI * 2 + p.phase;
        const x = s.x + Math.sin(wave) * p.swayAmp;
        const rotate = p.rot0 + p.spin * s.t + Math.sin(wave) * 12;
        const flip = Math.sin((s.t / p.flipPeriod) * Math.PI * 2 + p.phase) * p.flipAmp;
        el.style.opacity = p.opacity.toFixed(2);
        el.style.transform = `translate3d(${x.toFixed(1)}px,${s.y.toFixed(1)}px,0) rotate(${rotate.toFixed(1)}deg) rotateX(${flip.toFixed(1)}deg) scale(${p.scale.toFixed(2)})`;
      });
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, [petals, reducedMotion, quietTop]);

  if (reducedMotion) return null;
  return (
    <div className="ambient-petals" ref={layer}>
      <PetalLayer petals={petals} petalEls={petalEls} keyPrefix={`ambient-${count}`} />
    </div>
  );
}
