import { petalPath } from './FloweringBranch.jsx';
import './section-divider.css';

// A flowering vine that runs out from a round medallion, used between homepage sections.
// Drawn in a 1200 x 160 box; on narrow screens the sides are cropped and the medallion stays centred.
const W = 1200;
const MID = 80;
const vineY = x => MID + 13 * Math.sin((x - 600) / 72);

function vine(x0, x1) {
  const pts = [];
  for (let x = x0; (x1 > x0 ? x <= x1 : x >= x1); x += (x1 > x0 ? 12 : -12)) pts.push(`${x},${vineY(x).toFixed(1)}`);
  return `M${pts.join('L')}`;
}

// [x, radius, tone, kind]
const FLOWERS = [
  [70, 9, 'e', 'bud'], [150, 17, 'a', 'open'], [250, 12, 'd', 'open'], [345, 20, 'b', 'open'], [432, 8, 'c', 'bud'], [500, 13, 'e', 'open'],
  [700, 13, 'd', 'open'], [768, 8, 'a', 'bud'], [855, 20, 'c', 'open'], [950, 12, 'e', 'open'], [1050, 17, 'b', 'open'], [1130, 9, 'd', 'bud'],
];
const LEAVES = [110, 200, 295, 385, 470, 730, 815, 905, 1000, 1090].map((x, i) => [x, i % 2 ? 1 : -1]);

function Flower({ x, r, tone, kind }) {
  const y = vineY(x);
  if (kind === 'bud') {
    return <ellipse cx={x} cy={y - r * 0.9} rx={r * 0.62} ry={r} fill={`url(#fh-petal-${tone})`} transform={`rotate(${x % 2 ? 18 : -18} ${x} ${y})`} />;
  }
  return (
    <g transform={`translate(${x} ${y}) rotate(${(x * 7) % 72})`}>
      {[0, 72, 144, 216, 288].map(a => <path key={a} d={petalPath(r)} transform={`rotate(${a})`} fill={`url(#fh-petal-${tone})`} stroke="rgba(170,110,110,.14)" strokeWidth=".4" />)}
      <circle r={r * 0.2} fill="#c98b8e" />
      {[0, 1, 2, 3, 4].map(k => <circle key={k} cx={Math.cos(k * 1.257 + 0.6) * r * 0.36} cy={Math.sin(k * 1.257 + 0.6) * r * 0.36} r=".9" fill="#d8b074" />)}
    </g>
  );
}

export default function SectionDivider() {
  return (
    <div className="section-divider" aria-hidden="true" data-reveal>
      <svg viewBox={`0 0 ${W} 160`} preserveAspectRatio="xMidYMid slice">
        <g className="divider-vine" fill="none" stroke="#b27468" strokeWidth="1.6" strokeLinecap="round">
          <path d={vine(540, 30)} pathLength="1" />
          <path d={vine(660, 1170)} pathLength="1" />
        </g>
        {LEAVES.map(([x, side]) => {
          const y = vineY(x);
          return <path key={x} d="M0 0C6 -10 18 -13 27 -9C19 -1 9 3 0 0Z" fill="#a3ab88" opacity=".75" transform={`translate(${x} ${y}) rotate(${side * 28 + (x > 600 ? 180 : 0)}) scale(1 ${side})`} />;
        })}
        {FLOWERS.map(([x, r, tone, kind]) => (
          <g key={x} className="divider-pop" style={{ '--d': `${300 + Math.abs(x - 600) * 1.3}ms` }}><Flower x={x} r={r} tone={tone} kind={kind} /></g>
        ))}

        <g transform={`translate(600 ${MID})`}>
          <circle r="54" fill="#fcf6f1" stroke="rgba(155,79,69,.3)" />
          <circle r="45" fill="none" stroke="rgba(155,79,69,.35)" strokeDasharray="1.5 4" strokeLinecap="round" />
          <g className="divider-bloom">
            {[0, 72, 144, 216, 288].map(a => <path key={a} d={petalPath(27)} transform={`rotate(${a})`} fill={`url(#fh-petal-${a % 144 ? 'a' : 'b'})`} stroke="rgba(170,110,110,.16)" strokeWidth=".5" />)}
            <circle r="4.4" fill="#c98b8e" />
            {Array.from({ length: 9 }, (_, k) => {
              const a = (k / 9) * Math.PI * 2;
              return <circle key={k} cx={Math.cos(a) * 7.5} cy={Math.sin(a) * 7.5} r="1.1" fill="#d8b074" />;
            })}
          </g>
        </g>
      </svg>
    </div>
  );
}
