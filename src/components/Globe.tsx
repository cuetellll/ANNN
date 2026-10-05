import { useEffect, useRef } from 'react';
import { GEO, HOME_CC } from '../geo';
import { isLand } from '../land';

type Props = {
  status: 'idle' | 'connecting' | 'connected';
  markers: string[];
  target?: string;
  a1: string; a2: string; st: string;
  reduce?: boolean;
};

const D = Math.PI / 180;
type V3 = [number, number, number];
const toV = (lat: number, lon: number): V3 => [Math.cos(lat * D) * Math.cos(lon * D), Math.cos(lat * D) * Math.sin(lon * D), Math.sin(lat * D)];
const toLL = (v: V3): [number, number] => [Math.asin(Math.max(-1, Math.min(1, v[2]))) / D, Math.atan2(v[1], v[0]) / D];
function slerp(a: V3, b: V3, t: number): V3 {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const w = Math.acos(dot);
  if (w < 1e-4) return a;
  const s1 = Math.sin((1 - t) * w) / Math.sin(w), s2 = Math.sin(t * w) / Math.sin(w);
  return [a[0] * s1 + b[0] * s2, a[1] * s1 + b[1] * s2, a[2] * s1 + b[2] * s2];
}
const lerpAng = (a: number, b: number, t: number) => { const d = ((b - a + 540) % 360) - 180; return a + d * t; };

/**
 * نقاط کره (Fibonacci lattice) — فقط خشکی‌ها پررنگ کشیده میشن تا قاره‌ها
 * معلوم باشن؛ اقیانوس چند نقطه‌ی خیلی کم‌رنگ داره که کره خالی به نظر نیاد.
 * sin/cos عرض جغرافیایی از قبل حساب میشه که هر فریم سبک باشه.
 */
type Dot = { sp: number; cp: number; lon: number; land: boolean };
const DOTS: Dot[] = (() => {
  const n = 5200, out: Dot[] = [];
  const g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = g * i;
    const lat = Math.asin(y) / D, lon = Math.atan2(Math.sin(th) * r, Math.cos(th) * r) / D;
    const land = isLand(lat, lon);
    if (!land && i % 7) continue;
    out.push({ sp: Math.sin(lat * D), cp: Math.cos(lat * D), lon, land });
  }
  return out;
})();

/** ستاره‌های پس‌زمینه‌ی کارت (ثابت، با چشمک ملایم) */
const STARS = Array.from({ length: 70 }, (_, i) => {
  const r = (k: number) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
  return { x: r(1), y: r(2), s: 0.4 + r(3) * 1.1, ph: r(4) * Math.PI * 2, sp: 0.5 + r(5) * 1.5 };
});

export default function Globe(p: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const props = useRef(p);
  props.current = p;

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    let w = 0, h = 0, dpr = 1, raf = 0;
    let lon0 = 30, lat0 = 22, arcT = 0;
    const t0 = performance.now();
    let last = t0;
    const ro = new ResizeObserver(() => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = Math.max(1, w * dpr); cv.height = Math.max(1, h * dpr);
    });
    ro.observe(cv);

    const frame = (now: number) => {
      const P = props.current;
      const dt = Math.min(64, now - last); last = now;
      const t = (now - t0) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const R = Math.min(w * 0.36, h * 0.42), cx = w / 2, cy = h / 2;
      if (R <= 4) { raf = requestAnimationFrame(frame); return; }

      // stars
      ctx.fillStyle = '#fff';
      for (const s of STARS) {
        const x = s.x * w, y = s.y * h;
        if (Math.hypot(x - cx, y - cy) < R * 1.15) continue;
        ctx.globalAlpha = 0.15 + 0.35 * (P.reduce ? 0.5 : 0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
        ctx.fillRect(x, y, s.s, s.s);
      }
      ctx.globalAlpha = 1;

      const home = GEO[HOME_CC], tgt = P.target ? GEO[P.target] : undefined;
      // rotation
      if (P.status === 'connected' && tgt) {
        const mid = toLL(slerp(toV(home[0], home[1]), toV(tgt[0], tgt[1]), 0.5));
        lon0 = lerpAng(lon0, mid[1], 0.03); lat0 += (Math.max(-30, Math.min(40, mid[0])) - lat0) * 0.03;
      } else {
        lon0 += (P.reduce ? 0 : (P.status === 'connecting' ? 0.06 : 0.008)) * dt;
        lat0 += (22 - lat0) * 0.02;
      }
      const sl = Math.sin(lat0 * D), cl = Math.cos(lat0 * D);
      const proj = (lat: number, lon: number, k = 1) => {
        const l = (lon - lon0) * D, cp = Math.cos(lat * D), sp = Math.sin(lat * D);
        const x = cp * Math.sin(l), y = cl * sp - sl * cp * Math.cos(l), z = sl * sp + cl * cp * Math.cos(l);
        return { x: cx + R * k * x, y: cy - R * k * y, z, vis: z > 0 || Math.hypot(x, y) * k > 1.0 };
      };

      // orbit ring (نیمه‌ی پشتی، قبل از کره کشیده میشه تا واقعاً پشتش بره)
      const OR = R * 1.24, TILT = -0.35, SQ = 0.26;
      const sa = t * (P.reduce ? 0 : 0.5);
      const ring = (from: number, to: number, alpha: string) => {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(TILT); ctx.scale(1, SQ);
        ctx.strokeStyle = P.a2 + alpha; ctx.lineWidth = 1 / SQ * 0.7;
        ctx.beginPath(); ctx.arc(0, 0, OR, from, to); ctx.stroke(); ctx.restore();
      };
      const sat = () => {
        const x = Math.cos(sa) * OR, y = Math.sin(sa) * OR * SQ;
        const X = cx + x * Math.cos(TILT) - y * Math.sin(TILT), Y = cy + x * Math.sin(TILT) + y * Math.cos(TILT);
        ctx.fillStyle = P.a2; ctx.shadowColor = P.a2; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(X, Y, 2.6, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      };
      const satBehind = Math.sin(sa) < 0;
      ring(Math.PI, Math.PI * 2, '22');
      if (satBehind) { ctx.globalAlpha = 0.35; sat(); ctx.globalAlpha = 1; }

      // atmosphere (یه هاله‌ی نازک، نه یه لکه‌ی بزرگ)
      const atm = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.18);
      atm.addColorStop(0, P.a1 + '44'); atm.addColorStop(1, P.a1 + '00');
      ctx.fillStyle = atm; ctx.beginPath(); ctx.arc(cx, cy, R * 1.18, 0, Math.PI * 2); ctx.fill();
      // body
      const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      body.addColorStop(0, '#16204a'); body.addColorStop(0.75, '#090e24'); body.addColorStop(1, '#060918');
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

      // dots
      for (const d of DOTS) {
        const l = (d.lon - lon0) * D, cl2 = Math.cos(l);
        const z = sl * d.sp + cl * d.cp * cl2;
        if (z <= 0.02) continue;
        const x = cx + R * d.cp * Math.sin(l), y = cy - R * (cl * d.sp - sl * d.cp * cl2);
        if (d.land) {
          ctx.fillStyle = '#c3cdff'; ctx.globalAlpha = 0.18 + z * 0.72;
          const s = 0.9 + z * 1.3; ctx.fillRect(x - s / 2, y - s / 2, s, s);
        } else {
          ctx.fillStyle = '#7d89c9'; ctx.globalAlpha = z * 0.18;
          ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
        }
      }
      ctx.globalAlpha = 1;

      // rim + terminator shading
      const shade = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.4, cx, cy, R * 1.02);
      shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(2,3,12,.55)');
      ctx.fillStyle = shade; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = P.a1 + '55'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

      // scanning band while connecting
      if (P.status === 'connecting') {
        const yb = cy + Math.sin(t * 2.4) * R * 0.9;
        const g = ctx.createLinearGradient(0, yb - 26, 0, yb + 26);
        g.addColorStop(0, 'transparent'); g.addColorStop(0.5, P.st + '40'); g.addColorStop(1, 'transparent');
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
        ctx.fillStyle = g; ctx.fillRect(cx - R, yb - 26, R * 2, 52); ctx.restore();
      }

      // markers
      for (const cc of P.markers) {
        const g = GEO[cc]; if (!g) continue;
        const q = proj(g[0], g[1]); if (q.z <= 0.05) continue;
        if (cc === P.target && P.status === 'connected') continue;
        ctx.globalAlpha = 0.4 + q.z * 0.6;
        ctx.fillStyle = P.a2; ctx.shadowColor = P.a2; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(q.x, q.y, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        const ph = (t * 0.6 + (cc.charCodeAt(0) % 7) / 7) % 1;
        ctx.strokeStyle = P.a2; ctx.globalAlpha = (1 - ph) * 0.45 * q.z; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(q.x, q.y, 2 + ph * 8, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // home
      const hq = proj(home[0], home[1]);
      if (hq.z > 0) {
        ctx.globalAlpha = 0.5 + hq.z * 0.5;
        ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(hq.x, hq.y, 3, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
        ctx.font = '600 9px "Segoe UI", sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.75)';
        ctx.fillText('YOU', hq.x + 6, hq.y - 6);
        ctx.globalAlpha = 1;
      }

      // arc to target
      if (tgt && (P.status === 'connected' || P.status === 'connecting')) {
        arcT = Math.min(1, arcT + dt / (P.status === 'connected' ? 900 : 2500));
        const a = toV(home[0], home[1]), b = toV(tgt[0], tgt[1]);
        const N = 64, pts: { x: number; y: number; vis: boolean }[] = [];
        for (let i = 0; i <= N; i++) {
          const f = i / N; if (f > arcT) break;
          const [la, lo] = toLL(slerp(a, b, f));
          pts.push(proj(la, lo, 1 + Math.sin(f * Math.PI) * 0.22));
        }
        ctx.lineWidth = 2; ctx.lineCap = 'round';
        const grad = ctx.createLinearGradient(hq.x, hq.y, pts[pts.length - 1]?.x ?? hq.x, pts[pts.length - 1]?.y ?? hq.y);
        grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, P.st);
        ctx.strokeStyle = grad; ctx.shadowColor = P.st; ctx.shadowBlur = 12;
        ctx.beginPath();
        let pen = false;
        for (const q of pts) { if (!q.vis) { pen = false; continue; } if (!pen) { ctx.moveTo(q.x, q.y); pen = true; } else ctx.lineTo(q.x, q.y); }
        ctx.stroke(); ctx.shadowBlur = 0;
        if (P.status === 'connected' && pts.length > 2) {
          for (let k = 0; k < 3; k++) {
            const f = ((t * 0.45 + k / 3) % 1);
            const q = pts[Math.floor(f * (pts.length - 1))];
            if (!q.vis) continue;
            ctx.fillStyle = '#fff'; ctx.shadowColor = P.st; ctx.shadowBlur = 14;
            ctx.beginPath(); ctx.arc(q.x, q.y, 2.4, 0, Math.PI * 2); ctx.fill();
          }
          ctx.shadowBlur = 0;
          const tq = proj(tgt[0], tgt[1]);
          if (tq.z > 0) {
            for (let k = 0; k < 2; k++) {
              const ph = (t * 0.7 + k / 2) % 1;
              ctx.strokeStyle = P.st; ctx.globalAlpha = 1 - ph; ctx.lineWidth = 1.5;
              ctx.beginPath(); ctx.arc(tq.x, tq.y, 4 + ph * 18, 0, Math.PI * 2); ctx.stroke();
            }
            ctx.globalAlpha = 1; ctx.fillStyle = P.st; ctx.shadowColor = P.st; ctx.shadowBlur = 16;
            ctx.beginPath(); ctx.arc(tq.x, tq.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
          }
        }
      } else arcT = 0;

      // specular
      const sp = ctx.createRadialGradient(cx - R * 0.45, cy - R * 0.5, 0, cx - R * 0.45, cy - R * 0.5, R * 0.9);
      sp.addColorStop(0, 'rgba(255,255,255,.06)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sp; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

      // orbit ring (نیمه‌ی جلویی)
      ring(0, Math.PI, '55');
      if (!satBehind) sat();

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={ref} className="globe" />;
}
