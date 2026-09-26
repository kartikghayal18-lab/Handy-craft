// A flowering cherry-style branch, built once from hand-placed geometry.
// The same geometry renders as the in-focus branch and as the soft window-light shadow behind the hero,
// and its blossom centres are exported so falling petals can start exactly where the flowers are.

export const BRANCH_VIEWBOX = { width: 600, height: 560 };

const cubic = ([p0, p1, p2, p3], t) => {
  const u = 1 - t;
  return [0, 1].map(i => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i]);
};
const tangent = ([p0, p1, p2, p3], t) => {
  const u = 1 - t;
  return [0, 1].map(i => 3 * u * u * (p1[i] - p0[i]) + 6 * u * t * (p2[i] - p1[i]) + 3 * t * t * (p3[i] - p2[i]));
};

// [controlPoints, startWidth, endWidth]; twigs start on their parent so joints look grown, not glued.
const stems = {};
const addStem = (key, points, w0, w1) => { stems[key] = { points, w0, w1 }; };
const from = (key, t) => cubic(stems[key].points, t);
addStem('main', [[660, 64], [540, 52], [430, 132], [262, 236]], 21, 4);
addStem('A', [from('main', 0.3), [486, 44], [430, 22], [382, 20]], 9, 2);
addStem('B', [from('main', 0.48), [462, 214], [452, 290], [430, 368]], 9, 2.2);
addStem('C', [from('main', 0.72), [330, 238], [300, 292], [264, 338]], 6.5, 1.8);
addStem('E', [from('main', 0.99), [224, 252], [190, 246], [156, 232]], 4, 1.3);
addStem('F', [from('B', 0.58), [414, 352], [384, 404], [360, 452]], 4.5, 1.4);
addStem('G', [from('B', 0.3), [498, 296], [520, 344], [536, 398]], 4, 1.2);
addStem('H', [from('C', 0.6), [258, 330], [236, 376], [228, 418]], 3.5, 1);

// A thin catch-light along the upper edge of each stem so the bark reads as round, not flat.
function stemHighlight({ points, w0, w1 }) {
  const out = [];
  for (let i = 1; i <= 20; i += 1) {
    const t = i / 22;
    const [x, y] = cubic(points, t);
    const [dx, dy] = tangent(points, t);
    const len = Math.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * Math.pow(t, 0.8)) * 0.24;
    out.push(`${(x + (dy / len) * w).toFixed(1)},${(y - (dx / len) * w).toFixed(1)}`);
  }
  return `M${out.join('L')}`;
}

function stemPath({ points, w0, w1 }) {
  const steps = 28;
  const left = [];
  const right = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const [x, y] = cubic(points, t);
    const [dx, dy] = tangent(points, t);
    const len = Math.hypot(dx, dy) || 1;
    // Slight bulge near the base, like a real twig thickening where it joins.
    const w = (w0 + (w1 - w0) * Math.pow(t, 0.8)) / 2;
    const nx = -dy / len;
    const ny = dx / len;
    left.push(`${(x + nx * w).toFixed(1)},${(y + ny * w).toFixed(1)}`);
    right.unshift(`${(x - nx * w).toFixed(1)},${(y - ny * w).toFixed(1)}`);
  }
  return `M${left.join('L')}L${right.join('L')}Z`;
}

// [stem, t, dx, dy, radius, kind, rotation]
const BLOOMS = [
  ['main', 0.1, -6, -20, 17, 'open', 12], ['main', 0.18, 8, 22, 15, 'side', 40], ['main', 0.4, -4, -22, 18, 'open', -18],
  ['main', 0.52, 10, 21, 15, 'open', 32], ['main', 0.62, -10, -18, 7, 'bud', -30], ['main', 0.86, 4, 19, 16, 'open', 6],
  ['main', 0.95, -6, -15, 6, 'bud', -50],
  ['A', 0.52, -14, -8, 15, 'open', 2], ['A', 0.78, 10, -12, 13, 'side', -30], ['A', 1, -6, -2, 16, 'open', 16], ['A', 0.3, 14, 8, 6, 'bud', 60],
  ['B', 0.34, -19, 4, 16, 'open', -12], ['B', 0.62, 18, 6, 17, 'open', 26], ['B', 0.86, -15, 10, 14, 'side', -60], ['B', 1, 2, 15, 14, 'open', 0],
  ['C', 0.48, -14, -9, 14, 'open', 22], ['C', 1, -6, 13, 15, 'open', -14], ['C', 0.8, 14, 5, 6, 'bud', 30],
  ['E', 0.6, -2, -15, 13, 'open', 0], ['E', 1, -10, 2, 6, 'bud', -80],
  ['F', 0.6, -15, 2, 14, 'open', 10], ['F', 1, 4, 15, 15, 'open', -22], ['F', 0.82, 14, 8, 6, 'bud', 40],
  // Smaller flowers filling out each spray, the way real blossom clusters crowd a twig.
  ['G', 0.5, 12, -6, 11, 'open', 20], ['G', 0.8, -12, 6, 10, 'open', -10], ['G', 1, 6, 12, 12, 'open', 40], ['G', 0.95, 14, -4, 5, 'bud', 10],
  ['H', 0.5, 12, 4, 11, 'open', 0], ['H', 1, -4, 12, 12, 'open', 30], ['H', 0.8, -12, 2, 5, 'bud', -20],
  ['main', 0.3, 14, 18, 11, 'open', 50], ['main', 0.7, 6, 20, 10, 'open', -40], ['main', 0.24, -14, -16, 10, 'side', 10],
  ['A', 0.9, 16, 6, 10, 'open', 0], ['A', 0.65, 6, 14, 10, 'open', -25],
  ['B', 0.48, 16, -8, 10, 'open', 60], ['B', 0.95, -16, -2, 11, 'open', 15],
  ['F', 0.4, 12, -4, 10, 'open', -5], ['F', 0.9, -14, -4, 9, 'side', 20],
  ['C', 0.7, -4, 16, 10, 'open', 5], ['E', 0.3, 6, 14, 10, 'open', -30],
];

const LEAVES = [['main', 0.26, 34, 58], ['B', 0.18, 28, 150], ['C', 0.3, 26, 118], ['A', 0.18, 24, -58], ['F', 0.3, 22, 30]];

// Stable per-index jitter so every render (and every build) draws the same branch.
const jitter = (i, spread) => (Math.sin(i * 12.9898) * 43758.5453 % 1) * spread;

const blooms = BLOOMS.map(([stem, t, dx, dy, r, kind, rot], i) => {
  const base = cubic(stems[stem].points, t);
  return { base, cx: base[0] + dx * 1.2, cy: base[1] + dy * 1.2, r: r * 1.3, kind, rot, i };
});

export const BLOSSOM_ANCHORS = blooms.filter(b => b.kind !== 'bud').map(({ cx, cy, r }) => ({ x: cx, y: cy, r }));

export const petalPath = r => `M0 0C${-0.64 * r} ${-0.12 * r} ${-0.74 * r} ${-0.84 * r} ${-0.28 * r} ${-r}Q${-0.08 * r} ${-1.03 * r} 0 ${-0.9 * r}Q${0.09 * r} ${-1.03 * r} ${0.3 * r} ${-0.99 * r}C${0.72 * r} ${-0.8 * r} ${0.6 * r} ${-0.1 * r} 0 0Z`;

function Blossom({ cx, cy, r, kind, rot, i, silhouette }) {
  if (kind === 'bud') {
    return (
      <g transform={`translate(${cx} ${cy}) rotate(${rot})`}>
        <ellipse rx={r * 0.7} ry={r} fill={silhouette ? 'currentColor' : 'url(#fh-bud)'} />
        {!silhouette && <path d={`M${-r * 0.7} ${r * 0.5}Q0 ${r * 1.7} ${r * 0.7} ${r * 0.5}Q0 ${r * 1.05} ${-r * 0.7} ${r * 0.5}Z`} fill="#7d6a4a" opacity=".8" />}
      </g>
    );
  }
  const tilt = kind === 'side' ? 0.52 : 0.86 + jitter(i, 0.14);
  const petals = [0, 1, 2, 3, 4].map(k => ({ angle: k * 72 + jitter(i * 5 + k, 10) - 5, len: r * (0.94 + jitter(i * 7 + k, 0.12)) }));
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${rot}) scale(1 ${tilt.toFixed(2)})`}>
      {petals.map((p, k) => (
        <path key={k} d={petalPath(p.len)} transform={`rotate(${p.angle.toFixed(1)})`}
          fill={silhouette ? 'currentColor' : `url(#fh-petal-${(i + k) % 3 === 0 ? 'b' : 'a'})`}
          stroke={silhouette ? 'none' : 'rgba(170,110,110,.1)'} strokeWidth=".4" opacity={silhouette ? 1 : 0.96} />
      ))}
      {!silhouette && (
        <g>
          <circle r={r * 0.16} fill="#c98b8e" opacity=".85" />
          {Array.from({ length: 11 }, (_, k) => {
            const a = (k / 11) * Math.PI * 2 + i + jitter(k, 0.4);
            const l = r * (0.3 + Math.abs(jitter(i * 3 + k, 0.22)));
            return <g key={k}><line x2={Math.cos(a) * l} y2={Math.sin(a) * l} stroke="#c6908a" strokeWidth=".35" /><circle cx={Math.cos(a) * l} cy={Math.sin(a) * l} r=".7" fill="#d8b074" /></g>;
          })}
        </g>
      )}
    </g>
  );
}

function Leaf({ stem, t, len, angle, silhouette }) {
  const [x, y] = cubic(stems[stem].points, t);
  const w = len * 0.34;
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <path d={`M0 0Q${len * 0.45} ${-w} ${len} 0Q${len * 0.45} ${w * 0.9} 0 0Z`} fill={silhouette ? 'currentColor' : 'url(#fh-leaf)'} />
      {!silhouette && <path d={`M1 0Q${len * 0.5} ${-w * 0.08} ${len * 0.92} 0`} stroke="rgba(70,72,40,.35)" strokeWidth=".6" fill="none" />}
    </g>
  );
}

export default function FloweringBranch({ silhouette = false, withDefs = true, className = '' }) {
  const { width, height } = BRANCH_VIEWBOX;
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} overflow="visible" aria-hidden="true" focusable="false">
      {!silhouette && withDefs && (
        <defs>
          <linearGradient id="fh-bark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7a5846" /><stop offset=".55" stopColor="#5a3f32" /><stop offset="1" stopColor="#473228" />
          </linearGradient>
          <radialGradient id="fh-bud" cx=".4" cy=".35" r=".8">
            <stop offset="0" stopColor="#f0c3c4" /><stop offset=".6" stopColor="#d88f99" /><stop offset="1" stopColor="#b86c78" />
          </radialGradient>
          <linearGradient id="fh-leaf" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#7f7b4c" /><stop offset="1" stopColor="#a7a476" />
          </linearGradient>
        </defs>
      )}
      <g fill={silhouette ? 'currentColor' : 'url(#fh-bark)'}>
        {Object.entries(stems).map(([key, stem]) => <path key={key} d={stemPath(stem)} />)}
        {Object.entries(stems).map(([key, stem]) => <circle key={key} cx={stem.points[0][0]} cy={stem.points[0][1]} r={stem.w0 / 2} />)}
      </g>
      {!silhouette && (
        <g fill="none" stroke="rgba(236,210,186,.32)" strokeLinecap="round">
          {Object.entries(stems).map(([key, stem]) => <path key={key} d={stemHighlight(stem)} strokeWidth={Math.max(0.6, stem.w0 * 0.14)} />)}
        </g>
      )}
      {!silhouette && (
        <g stroke="#5a3f32" strokeWidth=".9" strokeLinecap="round" fill="none" opacity=".75">
          {blooms.map(b => <path key={b.i} d={`M${b.base[0].toFixed(1)} ${b.base[1].toFixed(1)}Q${((b.base[0] + b.cx) / 2 + 3).toFixed(1)} ${((b.base[1] + b.cy) / 2).toFixed(1)} ${b.cx.toFixed(1)} ${b.cy.toFixed(1)}`} />)}
        </g>
      )}
      {LEAVES.map(([stem, t, len, angle], i) => <Leaf key={i} stem={stem} t={t} len={len} angle={angle} silhouette={silhouette} />)}
      {blooms.map(b => <Blossom key={b.i} {...b} silhouette={silhouette} />)}
    </svg>
  );
}

// Shared petal gradients live once in the document so every falling petal can reference them.
export function PetalDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="fh-petal-a" cx=".5" cy="1" r="1.05">
          <stop offset="0" stopColor="#dc9ea5" /><stop offset=".3" stopColor="#f0c9ca" /><stop offset=".75" stopColor="#f9e6e2" /><stop offset="1" stopColor="#fdf4f0" />
        </radialGradient>
        <radialGradient id="fh-petal-b" cx=".5" cy="1" r="1.05">
          <stop offset="0" stopColor="#d99f9c" /><stop offset=".36" stopColor="#f3d3cf" /><stop offset="1" stopColor="#fef6f2" />
        </radialGradient>
        <radialGradient id="fh-petal-c" cx=".5" cy="1" r="1.05">
          <stop offset="0" stopColor="#cf8e97" /><stop offset=".45" stopColor="#ebbfc1" /><stop offset="1" stopColor="#f8e2df" />
        </radialGradient>
        <radialGradient id="fh-petal-d" cx=".5" cy="1" r="1.05">
          <stop offset="0" stopColor="#df9f88" /><stop offset=".4" stopColor="#f3cdb8" /><stop offset="1" stopColor="#fdf0e6" />
        </radialGradient>
        <radialGradient id="fh-petal-e" cx=".5" cy="1" r="1.05">
          <stop offset="0" stopColor="#e3c3c0" /><stop offset=".35" stopColor="#f8ece6" /><stop offset="1" stopColor="#fffcf8" />
        </radialGradient>
      </defs>
    </svg>
  );
}
