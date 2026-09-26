import { useEffect } from 'react';
import { petalState } from './petals.js';

const SMOOTHING = 0.14;

/**
 * Scroll-linked depth for one page: parallax layers plus petals that fall from flowers in a photo or drawing.
 * One passive scroll listener, one rAF loop that only runs while the scroll is settling, transform/opacity writes only.
 *
 * @param containerRef the page section the scene belongs to; motion stops once it is well out of view
 * @param anchorRef an untransformed box that holds the flowers (its content may move by `anchorRate`)
 * @param scene { width, blossoms } the flowers' positions in the anchor's own pixel space
 * @param anchorRate parallax rate of the thing the flowers sit on, so resting petals move with their flower
 * @param layers [{ ref, rate, fade?: [start, span, amount], sway?: degrees }]; rate is px held back (+) or pushed ahead (-) per px scrolled
 * @param range how far past the container (in multiples of its height) the scene keeps animating
 * @param startAt 'top': the scene's timeline starts at the top of the page (a hero);
 *                'enter': it starts as the container scrolls into view (a section further down)
 */
export function useScrollScene({ containerRef, anchorRef, scene, anchorRate = 0, layers, petals, petalEls, enabled, range = 1.9, startAt = 'top' }) {
  useEffect(() => {
    if (!enabled) return undefined;
    let frame = 0;
    let smoothY = window.scrollY;
    let vw = window.innerWidth;
    let vh = window.innerHeight;
    let height = containerRef.current.offsetHeight;
    let flowerBox = { x: 0, y: 0, scale: 1, lift: -anchorRate };
    // Scroll position where this scene's timeline begins; everything below runs on scroll relative to it.
    let origin = 0;
    let wasHidden = false;

    const measure = () => {
      vw = window.innerWidth;
      vh = window.innerHeight;
      height = containerRef.current.offsetHeight;
      const top = containerRef.current.getBoundingClientRect().top + window.scrollY;
      origin = startAt === 'enter' ? Math.max(0, top - vh * 0.75) : 0;
      const rect = anchorRef.current.getBoundingClientRect();
      // Flower positions are stored as "where they sit on screen when the timeline starts".
      flowerBox = { x: rect.left + window.scrollX, y: rect.top + window.scrollY - origin, scale: rect.width / scene.width, lift: -anchorRate };
      // Only flowers that are actually in frame may shed petals.
      const visible = scene.blossoms.filter(a => {
        const x = rect.left + a.x * flowerBox.scale;
        return x > 24 && x < vw - 24;
      });
      const pool = visible.length ? visible : scene.blossoms;
      petals.forEach(p => { p.anchor = pool[Math.floor(p.anchorPick * pool.length)]; });
    };

    const render = () => {
      const scrollY = window.scrollY - origin;
      const local = smoothY - origin;
      if (scrollY > height * range) {
        if (!wasHidden) petalEls.current.forEach(el => { if (el) el.style.opacity = '0'; });
        wasHidden = true;
        return;
      }
      wasHidden = false;
      const s = Math.min(Math.max(scrollY, 0), height * 1.2);
      // A breath of wind: anything that sways dips and settles as the page moves.
      const breeze = Math.sin(local / 260) * 0.7 * Math.min(1, Math.max(0, local) / 200);
      layers.forEach(({ ref, rate, fade, sway }) => {
        const el = ref.current;
        if (!el) return;
        el.style.transform = `translate3d(0,${(s * rate).toFixed(1)}px,0)${sway ? ` rotate(${(breeze * sway).toFixed(2)}deg)` : ''}`;
        if (fade) {
          const [start, span, amount] = fade;
          const t = Math.min(1, Math.max(0, (s - height * start) / (height * span)));
          el.style.opacity = (1 - t * amount).toFixed(3);
        }
      });

      petals.forEach((p, i) => {
        const el = petalEls.current[i];
        if (!el) return;
        const st = petalState(p, scrollY, local, flowerBox, vw, vh);
        if (st.opacity < 0.01) {
          if (el.style.opacity !== '0') el.style.opacity = '0';
          return;
        }
        el.style.opacity = st.opacity.toFixed(3);
        el.style.transform = `translate3d(${st.x.toFixed(1)}px,${st.y.toFixed(1)}px,0) rotate(${st.rotate.toFixed(1)}deg) rotateX(${st.flip.toFixed(1)}deg) scale(${p.scale.toFixed(2)})`;
      });
    };

    const tick = () => {
      const target = window.scrollY;
      smoothY += (target - smoothY) * SMOOTHING;
      if (Math.abs(target - smoothY) < 0.2) smoothY = target;
      render();
      frame = smoothY === target ? 0 : requestAnimationFrame(tick);
    };
    const wake = () => { if (!frame) frame = requestAnimationFrame(tick); };

    let resizeTimer = 0;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { measure(); render(); }, 120);
    };

    measure();
    render();
    window.addEventListener('scroll', wake, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    // Web fonts change text height, which moves anything laid out below it.
    document.fonts?.ready.then(() => { measure(); render(); });

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(resizeTimer);
      window.removeEventListener('scroll', wake);
      window.removeEventListener('resize', onResize);
      layers.forEach(({ ref }) => { if (ref.current) { ref.current.style.transform = ''; ref.current.style.opacity = ''; } });
    };
  }, [enabled, petals, layers, scene, anchorRate, containerRef, anchorRef, petalEls, range, startAt]);
}
