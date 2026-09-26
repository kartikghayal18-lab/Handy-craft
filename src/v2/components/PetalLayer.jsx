import { petalPath } from './FloweringBranch.jsx';

const FLOWER_PETALS = [0, 72, 144, 216, 288];

// The falling petals, in screen space so they can keep drifting past the section they came from.
export default function PetalLayer({ petals, petalEls, keyPrefix }) {
  return (
    <div className="petal-layer" aria-hidden="true">
      {petals.map((p, i) => (p.flower ? (
        <svg key={`${keyPrefix}-${i}`} ref={el => { petalEls.current[i] = el; }} className={`petal petal-flower petal-${p.depth}`} viewBox="-12 -12 24 24" width="28" height="28">
          {FLOWER_PETALS.map((a, k) => (
            <path key={k} d={petalPath(10.5 + (k % 2) * 0.8)} transform={`rotate(${a + (i % 3) * 4})`} fill={`url(#fh-petal-${p.tone})`} />
          ))}
          <circle r="1.9" fill="#c98b8e" opacity=".85" />
          {FLOWER_PETALS.map((a, k) => {
            const rad = ((a + 36) * Math.PI) / 180;
            return <circle key={k} cx={Math.cos(rad) * 3.4} cy={Math.sin(rad) * 3.4} r=".75" fill="#d8b074" />;
          })}
        </svg>
      ) : (
        <svg key={`${keyPrefix}-${i}`} ref={el => { petalEls.current[i] = el; }} className={`petal petal-${p.depth}`} viewBox="-9.5 -12.8 19 13.4" width="30" height="21">
          <path d={petalPath(12)} fill={`url(#fh-petal-${p.tone})`} />
        </svg>
      )))}
    </div>
  );
}
