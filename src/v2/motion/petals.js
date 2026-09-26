// Petal "personalities". Everything is a pure function of scroll so scrolling back up reverses the fall.

const rand = seed => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const between = (r, a, b) => a + r() * (b - a);

export const PETAL_BUDGET = { desktop: 46, tablet: 28, mobile: 14 };
// A few petals are already on their way down when the page opens, so the scene never looks frozen.
const ALREADY_FALLING = [-150, -300, -460];

// depth: 'far' (small, slower, softer), 'mid' (from the branch), 'near' (large, close to the lens, enters from above).
// preFalling: a few petals are already mid-air at the start of the timeline (for a scene at the top of the page).
// detachWindow / speedScale: compress the timeline for short pages, so every petal lets go and falls within the available scroll.
export function createPetals(count, { anchors, allowNear, preFalling = true, detachWindow = 620, speedScale = 1 }) {
  const r = rand(20260926);
  const petals = [];
  // Interleave depths so near, mid and far petals take turns letting go.
  const pattern = allowNear ? ['mid', 'far', 'mid', 'near', 'mid', 'far', 'mid'] : ['mid', 'far', 'mid'];
  // The first ~700px of scroll is where the branch lets go of its petals; later petals detach further apart.
  for (let i = 0; i < count; i += 1) {
    const depth = pattern[i % pattern.length];
    // Now and then a whole blossom lets go instead of a single petal: heavier, so it falls a little faster and tumbles less.
    const flower = depth !== 'near' && i % 5 === 2;
    // The flowers sit on the right, so every third petal instead drifts in from above the other side of the screen.
    const fromTop = allowNear && depth !== 'near' && i % 3 === 1;
    const scale = depth === 'near' ? between(r, 1.9, 2.4) : depth === 'far' ? between(r, 0.65, 0.8) : between(r, 1, 1.3);
    const progress = (i + r() * 0.8) / count;
    petals.push({
      depth,
      flower,
      fromTop,
      topX: between(r, 0.02, 0.5),
      // Picks one of the blossoms currently on screen (resolved by the motion loop on measure).
      anchorPick: r(),
      anchor: anchors[0],
      tone: ['a', 'b', 'c', 'd', 'e'][Math.floor(r() * 5)],
      detachAt: preFalling && i < ALREADY_FALLING.length && depth !== 'near' ? ALREADY_FALLING[i] * (detachWindow / 620) : 8 + Math.pow(progress, 1.15) * detachWindow + (depth === 'near' ? detachWindow * 0.22 : 0),
      // screen px fallen per px scrolled, once up to speed
      speed: speedScale * (depth === 'near' ? between(r, 1.1, 1.35) : depth === 'far' ? between(r, 0.55, 0.7) : between(r, 0.75, 1)),
      // steady breeze: mostly drifting left, towards the open wall, a few carried right
      drift: speedScale * (r() < 0.72 ? between(r, -0.42, -0.12) : between(r, 0.03, 0.12)),
      swayAmp: between(r, 10, 30) * (depth === 'near' ? 1.6 : depth === 'far' ? 0.6 : 1),
      swayPeriod: between(r, 190, 340),
      swayPhase: between(r, 0, Math.PI * 2),
      spin: (r() < 0.5 ? -1 : 1) * between(r, 0.08, 0.42),
      rot0: between(r, 0, 360),
      flipAmp: between(r, 35, 72),
      flipPeriod: between(r, 150, 280),
      flipPhase: between(r, 0, Math.PI * 2),
      // Petals on the open side wander both ways instead of all being blown off the left edge.
      ...(fromTop ? { drift: speedScale * between(r, -0.14, 0.2) } : {}),
      ...(flower ? { speed: speedScale * between(r, 0.95, 1.15), spin: (r() < 0.5 ? -1 : 1) * between(r, 0.05, 0.18), flipAmp: between(r, 15, 30) } : {}),
      scale: flower ? scale * 0.85 : scale,
      opacity: depth === 'far' ? between(r, 0.55, 0.72) : depth === 'near' ? 0.85 : between(r, 0.82, 0.95),
      nearX: r() < 0.45 ? between(r, 0.01, 0.4) : between(r, 0.55, 0.97),
      offset: [between(r, -0.35, 0.35), between(r, -0.35, 0.35)],
    });
  }
  return petals;
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Falls from rest and settles into a steady speed, like a petal reaching terminal velocity.
const fallDistance = (ds, speed) => (speed * ds * ds) / (ds + 110);

/**
 * @param p petal
 * @param scrollY real scroll (keeps un-detached petals on their flower)
 * @param smoothY interpolated scroll (drives the fall, so it never jitters)
 * @param branch { x, y, scale, lift } where the flowers sit in document space
 * @param vh viewport height, vw viewport width
 */
export function petalState(p, scrollY, smoothY, branch, vw, vh) {
  const ds = Math.max(0, smoothY - p.detachAt);
  let x0;
  let y0;
  if (p.depth === 'near') {
    x0 = p.nearX * vw;
    y0 = -60;
  } else if (p.fromTop) {
    x0 = p.topX * vw;
    y0 = -40;
  } else {
    const held = Math.min(scrollY, Math.max(0, p.detachAt));
    x0 = branch.x + (p.anchor.x + p.offset[0] * p.anchor.r) * branch.scale;
    y0 = branch.y + (p.anchor.y + p.offset[1] * p.anchor.r) * branch.scale - held * (1 + branch.lift);
  }
  const ramp = smoothstep(0, 140, ds);
  const x = x0 + p.drift * ds + p.swayAmp * Math.sin((ds / p.swayPeriod) * Math.PI * 2 + p.swayPhase) * ramp - p.swayAmp * Math.sin(p.swayPhase) * ramp;
  const y = y0 + fallDistance(ds, p.speed);
  const rotate = p.rot0 + p.spin * ds + Math.sin((ds / p.swayPeriod) * Math.PI * 2) * 12 * ramp;
  const flip = Math.sin((ds / p.flipPeriod) * Math.PI * 2 + p.flipPhase) * p.flipAmp * ramp;

  const fadeIn = p.depth === 'near' || p.fromTop ? 1 : smoothstep(0, 36, ds);
  const fadeOut = 1 - smoothstep(vh * 0.8, vh * 1.02, y);
  const tired = 1 - smoothstep(1500, 1900, ds);
  const opacity = p.opacity * fadeIn * fadeOut * tired;
  return { x, y, rotate, flip, opacity };
}
