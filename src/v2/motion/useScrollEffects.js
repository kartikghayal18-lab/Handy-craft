import { useEffect } from 'react';

/**
 * Page-wide scroll effects, re-applied whenever the page (`key`) changes:
 * - [data-reveal]   fades and rises into place the first time it scrolls into view (stagger with --reveal-delay)
 * - [data-parallax] drifts against the scroll inside its frame; the value is the share of the frame height it travels
 * Elements that appear later (e.g. once data has loaded) are picked up too.
 */
export function useScrollEffects(key) {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canObserve = 'IntersectionObserver' in window;
    const parallax = new Set();
    const seen = new WeakSet();

    const io = canObserve && !reduce ? new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-revealed');
      io.unobserve(entry.target);
    }), { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }) : null;
    if (io) document.documentElement.classList.add('reveal-ready');

    const collect = root => {
      const found = [...(root.matches?.('[data-reveal], [data-parallax]') ? [root] : []), ...(root.querySelectorAll?.('[data-reveal], [data-parallax]') || [])];
      for (const el of found) {
        if (seen.has(el)) continue;
        seen.add(el);
        if (el.hasAttribute('data-parallax')) parallax.add(el);
        if (el.hasAttribute('data-reveal')) { if (io) io.observe(el); else el.classList.add('is-revealed'); }
      }
    };
    collect(document.body);
    const mo = new MutationObserver(records => {
      records.forEach(r => r.addedNodes.forEach(node => node.nodeType === 1 && collect(node)));
      onScroll();
    });
    mo.observe(document.body, { childList: true, subtree: true });

    let raf = 0;
    const update = () => {
      raf = 0;
      if (reduce) return;
      const vh = window.innerHeight;
      parallax.forEach(el => {
        if (!el.isConnected) { parallax.delete(el); return; }
        const frame = el.parentElement.getBoundingClientRect();
        if (frame.bottom < -100 || frame.top > vh + 100) return;
        const fromCentre = (frame.top + frame.height / 2 - vh / 2) / vh;
        el.style.setProperty('--py', `${(-fromCentre * parseFloat(el.dataset.parallax) * frame.height).toFixed(1)}px`);
      });
    };
    function onScroll() { if (!raf) raf = requestAnimationFrame(update); }
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      io?.disconnect();
      mo.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [key]);
}
