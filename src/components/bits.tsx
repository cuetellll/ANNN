import { useEffect, useRef, useState } from 'react';

/** عدد با انیمیشن شمارش */
export function useCountUp(value: number, ms = 600) {
  const [v, setV] = useState(value);
  const from = useRef(value);
  const cur = useRef(value);
  useEffect(() => {
    from.current = cur.current;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms), e = 1 - Math.pow(1 - k, 3);
      cur.current = from.current + (value - from.current) * e;
      setV(cur.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return v;
}

export function Count({ value, fmt }: { value: number; fmt: (n: number) => string }) {
  const v = useCountUp(value);
  return <>{fmt(v)}</>;
}

const smooth = (p: [number, number][]) =>
  p.map(([x, y], i) => {
    if (!i) return `M${x.toFixed(1)},${y.toFixed(1)}`;
    const [px, py] = p[i - 1], c = (px + x) / 2;
    return `C${c.toFixed(1)},${py.toFixed(1)} ${c.toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

/** نمودار مساحتی چندخطی */
export function Area({ series, n, h = 120, grid = false, id }: { series: { data: number[]; color: string; fill?: boolean }[]; n: number; h?: number; grid?: boolean; id: string }) {
  const W = 600;
  const max = Math.max(1024, ...series.flatMap((s) => s.data)) * 1.15;
  return (
    <svg className="area" viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none">
      <defs>
        {series.map((s, i) => (
          <linearGradient key={i} id={`${id}${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={s.color} stopOpacity=".42" /><stop offset="1" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {grid && [0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2={W} y1={h * g} y2={h * g} className="gl" />)}
      {series.map((s, i) => {
        const pad = Array(Math.max(0, n - s.data.length)).fill(0).concat(s.data.slice(-n));
        const pts = pad.map((v, j) => [(j / (n - 1)) * W, h - 3 - (v / max) * (h - 8)] as [number, number]);
        const line = smooth(pts);
        return (
          <g key={i}>
            {s.fill !== false && <path d={`${line} L${W},${h} L0,${h} Z`} fill={`url(#${id}${i})`} />}
            <path d={line} fill="none" stroke={s.color} strokeWidth={i ? 1.4 : 2} vectorEffect="non-scaling-stroke" style={{ filter: `drop-shadow(0 0 4px ${s.color})` }} />
          </g>
        );
      })}
    </svg>
  );
}
