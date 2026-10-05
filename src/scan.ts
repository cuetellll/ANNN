import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { VNode } from './parser';
import { buildTestConfig } from './singbox';
import { SCAN, TEST_URL, TEST_TIMEOUT } from './config';

export type ScanPhase = 'fetch' | 'tcp' | 'real' | 'done';
export type ScanState = {
  phase: ScanPhase;
  pool: number;      // کل کانفیگ‌های معتبر ساب عمومی
  tcpDone: number;
  tcpTotal: number;
  alive: number;     // جواب TCP دادن
  tested: number;    // تست واقعی شدن
  ok: number;        // تست واقعی موفق
  target: number;    // topN
};
export type ScanResult = { top: VNode[]; pings: Record<string, number>; state: ScanState; ms: number };

const UDP = new Set(['hy2', 'tuic']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SS_METHODS = new Set([
  'none', 'aes-128-gcm', 'aes-192-gcm', 'aes-256-gcm', 'chacha20-ietf-poly1305', 'xchacha20-ietf-poly1305',
  '2022-blake3-aes-128-gcm', '2022-blake3-aes-256-gcm', '2022-blake3-chacha20-poly1305',
  'aes-128-ctr', 'aes-192-ctr', 'aes-256-ctr', 'aes-128-cfb', 'aes-192-cfb', 'aes-256-cfb', 'chacha20-ietf', 'xchacha20', 'rc4-md5',
]);

/** کانفیگ‌هایی که قطعاً `sing-box check` رو رد می‌کنن همین اول کنار میرن، تا تست دسته‌ای خراب نشه */
export function looksValid(n: VNode): boolean {
  const o = n.outbound;
  if (n.port < 1 || n.port > 65535) return false;
  if ((o.type === 'vless' || o.type === 'vmess' || o.type === 'tuic') && !UUID.test(String(o.uuid || ''))) return false;
  if (o.type === 'shadowsocks' && (!SS_METHODS.has(String(o.method).toLowerCase()) || !o.password)) return false;
  if (o.type === 'trojan' && !o.password) return false;
  const r = o.tls?.reality;
  if (r) {
    if (!/^[A-Za-z0-9_-]{43}=?$/.test(String(r.public_key || ''))) return false;
    if (r.short_id && !/^[0-9a-f]{0,16}$/i.test(String(r.short_id))) return false;
  }
  return true;
}

/** یه کانفیگ از هر سرور:پورت:پروتکل؛ ساب‌های عمومی پر از تکراری‌ان */
export function dedupeEndpoints(ns: VNode[]): VNode[] {
  const seen = new Set<string>();
  return ns.filter((n) => {
    const k = `${n.protocol}|${n.server.toLowerCase()}|${n.port}|${n.outbound.transport?.type ?? ''}|${n.outbound.tls?.server_name ?? ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

/**
 * تست پینگ واقعی دسته‌ای. اگه یه دسته به‌خاطر یه کانفیگ خراب کلاً رد بشه،
 * نصفش می‌کنیم و دوباره (جستجوی دودویی)، تا فقط همون خرابه کنار بره.
 */
export async function realTest(
  list: VNode[],
  opt: { timeout?: number; concurrency?: number; chunk?: number; onItem?: (done: number) => void } = {},
): Promise<number[]> {
  const timeout = opt.timeout ?? TEST_TIMEOUT;
  const chunk = opt.chunk ?? SCAN.realChunk;
  let done = 0;
  const call = (ns: VNode[]) =>
    invoke<number[]>('test_delays', {
      config: JSON.stringify(buildTestConfig(ns)), count: ns.length, url: TEST_URL, timeout, concurrency: opt.concurrency ?? 16,
    });
  const run = async (ns: VNode[]): Promise<number[]> => {
    try {
      const r = await call(ns);
      done += ns.length; opt.onItem?.(done);
      return r;
    } catch {
      if (ns.length === 1) { done += 1; opt.onItem?.(done); return [-1]; }
      const m = ns.length >> 1;
      return [...(await run(ns.slice(0, m))), ...(await run(ns.slice(m)))];
    }
  };
  const out: number[] = [];
  for (let i = 0; i < list.length; i += chunk) out.push(...(await run(list.slice(i, i + chunk))));
  return out;
}

/**
 * اسکن هوشمند: از بین هزاران کانفیگ ساب عمومی، با اینترنت خود کاربر
 * سریع‌ترین‌ها رو پیدا می‌کنه.
 *  1) TCP خام به همه (سریع، موازی) → سرورهای مرده و فیلترشده حذف
 *  2) تست HTTP واقعی از داخل تونل روی بهترین‌های مرحله‌ی ۱
 *  3) اگه به تعداد کافی نرسید، دسته‌ی بعدی
 */
export async function smartScan(input: VNode[], topN: number, onState: (s: ScanState) => void): Promise<ScanResult> {
  const t0 = performance.now();
  let pool = dedupeEndpoints(input.filter(looksValid));
  if (pool.length > SCAN.maxPool) pool = shuffle(pool).slice(0, SCAN.maxPool);

  const st: ScanState = { phase: 'tcp', pool: pool.length, tcpDone: 0, tcpTotal: 0, alive: 0, tested: 0, ok: 0, target: topN };
  const emit = () => onState({ ...st });

  const tcpNodes = pool.filter((n) => !UDP.has(n.protocol));
  const udpNodes = shuffle(pool.filter((n) => UDP.has(n.protocol))).slice(0, SCAN.udpExtra);
  st.tcpTotal = tcpNodes.length;
  emit();

  // ---- مرحله ۱: TCP ----
  const un = await listen<{ phase: string; done: number; total: number }>('scan-progress', (e) => {
    if (e.payload.phase === 'tcp') { st.tcpDone = e.payload.done; emit(); }
  });
  let tcp: number[] = [];
  try {
    tcp = tcpNodes.length
      ? await invoke<number[]>('tcp_ping', {
          targets: tcpNodes.map((n) => ({ host: n.server, port: n.port })),
          timeout: SCAN.tcpTimeout, concurrency: SCAN.tcpConcurrency,
        })
      : [];
  } finally { un(); }

  const alive = tcpNodes.map((n, i) => [n, tcp[i] ?? -1] as const).filter(([, p]) => p > 0).sort((a, b) => a[1] - b[1]);
  st.tcpDone = st.tcpTotal; st.alive = alive.length + udpNodes.length;

  // تنوع: از یه سرور (مثلاً یه IP کلودفلر) حداکثر چندتا
  const perHost = new Map<string, number>();
  const queue: VNode[] = [];
  for (const [n] of alive) {
    const k = n.server.toLowerCase(), c = perHost.get(k) ?? 0;
    if (c >= SCAN.perHost) continue;
    perHost.set(k, c + 1); queue.push(n);
  }
  // UDP ها رو لابه‌لای بهترین‌ها می‌ذاریم که شانس تست داشته باشن
  udpNodes.forEach((n, i) => queue.splice(Math.min(queue.length, 6 + i * 4), 0, n));

  // ---- مرحله ۲: تست واقعی ----
  st.phase = 'real'; emit();
  const pings: Record<string, number> = {};
  const ok: VNode[] = [];
  let i = 0, round = 0;
  while (ok.length < topN && i < queue.length && st.tested < SCAN.maxReal) {
    const size = Math.min(round === 0 ? Math.max(topN * 6, 60) : 60, SCAN.maxReal - st.tested);
    const batch = queue.slice(i, i + size);
    i += batch.length; round++;
    const base = st.tested;
    const res = await realTest(batch, {
      timeout: SCAN.realTimeout, concurrency: SCAN.realConcurrency,
      onItem: (d) => { st.tested = base + d; emit(); },
    });
    batch.forEach((n, k) => { pings[n.id] = res[k]; if (res[k] > 0) ok.push(n); });
    st.tested = base + batch.length; st.ok = ok.length; emit();
  }

  ok.sort((a, b) => pings[a.id] - pings[b.id]);
  const top = ok.slice(0, topN);
  const outP: Record<string, number> = {};
  top.forEach((n) => (outP[n.id] = pings[n.id]));
  st.phase = 'done'; st.ok = ok.length; emit();
  return { top, pings: outP, state: { ...st }, ms: Math.round(performance.now() - t0) };
}
