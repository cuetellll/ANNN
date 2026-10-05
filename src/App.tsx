import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type MouseEvent as RME } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { decodeSubscription, parseLinks, type VNode } from './parser';
import { buildConfig, buildAetherConfig } from './singbox';
import { BUILTIN_SOURCES, DEFAULT_TOP_N, PROXY_PORT, RELEASE_API, RELEASE_PAGE, type SubSource, type AetherProto, type AetherScan } from './config';
import { smartScan, realTest, type ScanState } from './scan';
import { t, type Lang } from './i18n';
import { I } from './icons';
import { IS_ANDROID } from './platform';
import { GEO, ccHue } from './geo';
import Globe from './components/Globe';
import CoreIcon from './components/CoreIcon';
import WaveName from './components/WaveName';
import { Area, Count } from './components/bits';

type Status = 'idle' | 'connecting' | 'connected';
type Mode = 'tun' | 'proxy';
type Page = 'home' | 'servers' | 'stats' | 'settings';
type Step = '' | 'test' | 'start' | 'switch' | 'aether';
/** v2.5: مدل اتصال · v2 = مدل ۱ (کانفیگ‌های V2Ray با sing-box)، aether = مدل ۲ */
type Engine = 'v2' | 'aether';
type Theme = 'violet' | 'cyan' | 'emerald' | 'sunset' | 'aurora' | 'rose';
type IpInfo = { query: string; country: string; countryCode: string } | null;
type Toast = { id: number; msg: string; type: 'ok' | 'err' };
type CustomSub = { id: string; name: string; url: string };
type LastScan = { pool: number; alive: number; tested: number; ok: number; picked: number; ms: number; at: number } | null;
type Src = 'own' | 'pub';

const VERSION = '2.5.0';
/** مقایسه‌ی نسخه: a > b ؟ */
const newer = (a: string, b: string) => { const x = a.replace(/^v/, '').split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
const HIST = 90;
const PAGES: Page[] = ['home', 'servers', 'stats', 'settings'];
const THEMES: Record<Theme, [string, string]> = {
  violet: ['#8b5cff', '#ff4fd8'], cyan: ['#22d3ee', '#3b82f6'], emerald: ['#10f5a8', '#22d3ee'], sunset: ['#ff7a45', '#ff3d81'],
  aurora: ['#7c5cff', '#00e5b0'], rose: ['#ff4f8b', '#a78bfa'],
};
const AE_PROTOS: [AetherProto, string][] = [['masque', 'MASQUE'], ['wg', 'WireGuard'], ['gool', 'Gool']];
const AE_SCANS: AetherScan[] = ['turbo', 'balanced', 'thorough', 'ironclad'];
const ST: Record<Status, string> = { idle: '#ff5a7a', connecting: '#ffb547', connected: '#10f5a8' };

const load = <T,>(k: string, d: T): T => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; }
};
const save = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
const errMsg = (e: unknown) => String((e as any)?.message ?? e).split('\n').slice(-3).join(' ').slice(0, 220);
const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((x) => String(x).padStart(2, '0')).join(':');
};
const fmtBytes = (b: number) => {
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(b < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
};
const pingClass = (p?: number) => (p === undefined ? '' : p < 0 ? 'bad' : p < 300 ? 'good' : p < 700 ? 'mid' : 'slow');
const pingLevel = (p?: number) => (p === undefined || p < 0 ? 0 : p < 150 ? 5 : p < 300 ? 4 : p < 500 ? 3 : p < 800 ? 2 : 1);

/** ویندوز ایموجی پرچم رو نشون نمیده؛ تبدیلش می‌کنیم به کد کشور */
const FLAG = /([\u{1F1E6}-\u{1F1FF}])([\u{1F1E6}-\u{1F1FF}])/u;
function splitFlag(name: string): { cc: string; label: string } {
  const m = name.match(FLAG);
  if (!m) return { cc: '', label: name.trim() };
  const cc = String.fromCharCode(m[1].codePointAt(0)! - 0x1f1e6 + 65, m[2].codePointAt(0)! - 0x1f1e6 + 65);
  return { cc, label: name.replace(FLAG, '').replace(/^[\s|\-–_]+/, '').trim() || cc };
}
const transportOf = (n: VNode) => (n.outbound.tls?.reality ? 'reality' : n.outbound.transport?.type || '');

/* ---------- tiny UI atoms ---------- */
const Flag = ({ cc, size = 'm' }: { cc: string; size?: 's' | 'm' | 'l' }) => (
  <span className={`flag ${size}`} style={{ ['--h' as any]: ccHue(cc) } as CSSProperties}>{cc || '··'}</span>
);
const Meter = ({ p }: { p?: number }) => {
  const l = pingLevel(p);
  return <span className={`meter ${pingClass(p)}`}>{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= l ? 'on' : ''} style={{ animationDelay: `${i * 40}ms` }} />)}</span>;
};
const Switch = ({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => (
  <button className={`sw ${on ? 'on' : ''}`} disabled={disabled} onClick={() => onChange(!on)} role="switch" aria-checked={on}><i /></button>
);
const Card = ({ className = '', children, style }: { className?: string; children: ReactNode; style?: CSSProperties }) => (
  <div className={`glass ${className}`} style={style}>{children}</div>
);
const Kbd = ({ k }: { k: string }) => <span className="kbds">{k.split('+').map((x) => <kbd key={x}>{x}</kbd>)}</span>;

const PHASES: ScanState['phase'][] = ['fetch', 'tcp', 'real', 'done'];
const scanPct = (s: ScanState) =>
  s.phase === 'fetch' ? 5
    : s.phase === 'tcp' ? 8 + 52 * (s.tcpTotal ? s.tcpDone / s.tcpTotal : 0)
      : s.phase === 'real' ? 60 + 38 * Math.min(1, Math.max(s.ok / Math.max(1, s.target), s.tested / Math.max(60, s.target * 6)))
        : 100;

/** پنل زنده‌ی اسکن هوشمند: قیف «دریافت ← TCP ← تست واقعی ← برترین‌ها» */
function ScanPanel({ s, T, compact }: { s: ScanState; T: (typeof t)['fa']; compact?: boolean }) {
  const cur = PHASES.indexOf(s.phase);
  const pct = scanPct(s);
  const steps = [
    { label: T.scFetch, v: s.pool ? String(s.pool) : '' },
    { label: T.scTcp, v: s.phase === 'tcp' ? `${s.tcpDone}/${s.tcpTotal}` : cur > 1 ? String(s.alive) : '' },
    { label: T.scReal, v: s.tested ? `${s.ok}/${s.tested}` : '' },
    { label: T.scTop, v: cur >= 2 ? `${Math.min(s.ok, s.target)}/${s.target}` : '' },
  ];
  const sub = s.phase === 'fetch' ? T.scPhFetch : s.phase === 'tcp' ? T.scPhTcp(s.tcpDone, s.tcpTotal) : s.phase === 'real' ? T.scPhReal(s.tested) : T.scPhDone;
  return (
    <div className={`scan ${compact ? 'compact' : ''}`}>
      <div className="scan-h">
        <span className="radar"><i /><i /><b /></span>
        <div className="scan-t"><b>{T.scanTitle}</b><small className="mono-num">{sub}</small></div>
        <span className="scan-pct mono">{Math.round(pct)}%</span>
      </div>
      <div className="scan-bar"><i style={{ width: `${pct}%` }} /></div>
      <div className="funnel">
        {steps.map((x, i) => (
          <div key={i} className={`fs ${i < cur || s.phase === 'done' ? 'done' : i === cur ? 'on' : ''}`}>
            <span className="fs-dot">{i < cur || s.phase === 'done' ? I.check : <i />}</span>
            <span className="fs-v mono">{x.v || '·'}</span>
            <span className="fs-l">{x.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => load('lang', 'fa'));
  const [mode, setMode] = useState<Mode>(() => load('mode', 'tun'));
  // v2.5 · مدل اتصال
  const [engine, setEngine] = useState<Engine>(() => load('engine', 'v2'));
  const [aeProto, setAeProto] = useState<AetherProto>(() => load('aeProto', 'masque'));
  const [aeScan, setAeScan] = useState<AetherScan>(() => load('aeScan', 'balanced'));
  const [aeH2, setAeH2] = useState<boolean>(() => load('aeH2', false));
  const [aeLog, setAeLog] = useState('');
  const [aeSince, setAeSince] = useState(0);
  const [auto, setAuto] = useState<boolean>(() => load('auto', true));
  const [sortPing, setSortPing] = useState<boolean>(() => load('sortPing', false));
  const [links, setLinks] = useState<string[]>(() => load('links', []));
  const [selected, setSelected] = useState<string | null>(() => load('selected', null));
  const [pings, setPings] = useState<Record<string, number>>(() => load('pings', {}));
  const [favs, setFavs] = useState<string[]>(() => load('favs', []));
  const [fetchedAt, setFetchedAt] = useState<number>(() => load('fetchedAt', 0));
  const [theme, setTheme] = useState<Theme>(() => load('theme', 'violet'));
  const [reduce, setReduce] = useState<boolean>(() => load('reduce', false));
  const [autoConnect, setAutoConnect] = useState<boolean>(() => load('autoConnect', false));
  const [topN, setTopN] = useState<number>(() => load('topN', DEFAULT_TOP_N));
  const [customSubs, setCustomSubs] = useState<CustomSub[]>(() => load('customSubs', []));
  const [subOff, setSubOff] = useState<string[]>(() => load('subOff', []));
  const [srcOf, setSrcOf] = useState<Record<string, Src>>(() => load('srcOf', {}));
  const [picks, setPicks] = useState<string[]>(() => load('picks', []));
  const [lastScan, setLastScan] = useState<LastScan>(() => load('lastScan', null));
  const [scan, setScan] = useState<ScanState | null>(null);
  // v2.4
  const [manual, setManual] = useState<string[]>(() => load('manual', []));
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [upd, setUpd] = useState<'' | 'checking' | 'latest' | string>('');
  const importRef = useRef<HTMLTextAreaElement>(null);
  const [newSub, setNewSub] = useState('');
  const poolRef = useRef<VNode[] | null>(null);
  const [startup, setStartup] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [step, setStep] = useState<Step>('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'' | 'fetch' | 'test' | 'scan'>('');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [adminAsk, setAdminAsk] = useState(false);
  const [since, setSince] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [speed, setSpeed] = useState({ up: 0, down: 0, total: 0 });
  const [hist, setHist] = useState<{ d: number; u: number }[]>([]);
  const [ip, setIp] = useState<IpInfo | 'loading' | 'fail'>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [page, setPage] = useState<Page>('home');
  const [maxed, setMaxed] = useState(false);
  const [splash, setSplash] = useState(true);
  const [pal, setPal] = useState(false);
  const [palQ, setPalQ] = useState('');
  const [palI, setPalI] = useState(0);
  const [flash, setFlash] = useState(0);
  const [shake, setShake] = useState(false);
  const testingRef = useRef(false);
  const fromTray = useRef(false);
  const lastStats = useRef<[number, number] | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const palRef = useRef<HTMLInputElement>(null);
  const magRef = useRef<HTMLDivElement>(null);
  const T = t[lang];
  const win = getCurrentWindow();
  const [a1, a2] = THEMES[theme];

  const nodes = useMemo(() => parseLinks(links).nodes, [links]);
  const protocols = useMemo(() => Array.from(new Set(nodes.map((n) => n.protocol))), [nodes]);
  const online = useMemo(() => nodes.filter((n) => (pings[n.id] ?? -1) > 0).length, [nodes, pings]);
  const tested = useMemo(() => nodes.filter((n) => pings[n.id] !== undefined).length, [nodes, pings]);
  const bestId = useMemo(() => {
    const ok = nodes.filter((n) => (pings[n.id] ?? -1) > 0);
    return ok.length ? ok.reduce((a, b) => (pings[a.id] <= pings[b.id] ? a : b)).id : null;
  }, [nodes, pings]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q ? nodes.filter((n) => n.name.toLowerCase().includes(q) || n.protocol.includes(q)) : nodes;
    if (filter === 'fav') list = list.filter((n) => favs.includes(n.id));
    else if (filter === 'src-own') list = list.filter((n) => srcOf[n.id] !== 'pub');
    else if (filter === 'src-pub') list = list.filter((n) => srcOf[n.id] === 'pub');
    else if (filter !== 'all') list = list.filter((n) => n.protocol === filter);
    const fav = (n: VNode) => (favs.includes(n.id) ? 0 : 1);
    const v = (n: VNode) => { const p = pings[n.id]; return p === undefined ? 1e9 : p < 0 ? 1e10 : p; };
    return [...list].sort((a, b) => fav(a) - fav(b) || (sortPing ? v(a) - v(b) : 0));
  }, [nodes, query, sortPing, pings, filter, favs, srcOf]);
  const markers = useMemo(() => Array.from(new Set(nodes.map((n) => splitFlag(n.name).cc).filter((c) => c && GEO[c]))), [nodes]);
  const sources: SubSource[] = useMemo(() => [
    ...BUILTIN_SOURCES,
    ...customSubs.map((c) => ({ id: c.id, name: c.name, urls: [c.url], kind: 'public' as const })),
  ], [customSubs]);
  const rankOf = useMemo(() => new Map(picks.map((id, i) => [id, i])), [picks]);
  const hasBoth = useMemo(() => nodes.some((n) => srcOf[n.id] === 'pub') && nodes.some((n) => srcOf[n.id] !== 'pub'), [nodes, srcOf]);
  const quick = useMemo(() => nodes.filter((n) => (pings[n.id] ?? -1) > 0).sort((a, b) => pings[a.id] - pings[b.id]).slice(0, 3), [nodes, pings]);
  const active = nodes.find((n) => n.id === activeId);
  const selNode = nodes.find((n) => n.id === selected);
  const bestNode = nodes.find((n) => n.id === bestId);
  const shownNode = status !== 'idle' ? active ?? (auto ? bestNode : selNode) : auto ? bestNode : selNode;
  const shownFlag = shownNode ? splitFlag(shownNode.name) : null;

  useEffect(() => save('lang', lang), [lang]);
  useEffect(() => save('mode', mode), [mode]);
  useEffect(() => save('engine', engine), [engine]);
  useEffect(() => save('aeProto', aeProto), [aeProto]);
  useEffect(() => save('aeScan', aeScan), [aeScan]);
  useEffect(() => save('aeH2', aeH2), [aeH2]);
  // لاگ زنده‌ی Aether (مثلاً «در حال اسکن گیت‌وی‌ها...») زیر دکمه‌ی اتصال
  useEffect(() => {
    const un = listen<string>('aether-log', (e) => setAeLog(String(e.payload || '')));
    return () => { un.then((f) => f()).catch(() => {}); };
  }, []);
  // تایمر ثانیه‌شمار حین اسکن Aether
  useEffect(() => {
    if (status !== 'connecting' || step !== 'aether') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [status, step]);
  useEffect(() => save('auto', auto), [auto]);
  useEffect(() => save('sortPing', sortPing), [sortPing]);
  useEffect(() => save('links', links), [links]);
  useEffect(() => save('selected', selected), [selected]);
  useEffect(() => save('pings', pings), [pings]);
  useEffect(() => save('favs', favs), [favs]);
  useEffect(() => save('fetchedAt', fetchedAt), [fetchedAt]);
  useEffect(() => save('theme', theme), [theme]);
  useEffect(() => save('reduce', reduce), [reduce]);
  useEffect(() => save('autoConnect', autoConnect), [autoConnect]);
  useEffect(() => save('topN', topN), [topN]);
  useEffect(() => save('customSubs', customSubs), [customSubs]);
  useEffect(() => save('subOff', subOff), [subOff]);
  useEffect(() => save('srcOf', srcOf), [srcOf]);
  useEffect(() => save('picks', picks), [picks]);
  useEffect(() => save('lastScan', lastScan), [lastScan]);
  useEffect(() => save('manual', manual), [manual]);
  useEffect(() => { if (importOpen) window.setTimeout(() => importRef.current?.focus(), 40); }, [importOpen]);
  useEffect(() => { invoke<boolean>('get_autostart').then(setStartup).catch(() => {}); }, []);
  useEffect(() => {
    document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => { if (filter !== 'all' && filter !== 'fav' && !filter.startsWith('src-') && !protocols.includes(filter)) setFilter('all'); }, [protocols]); // eslint-disable-line
  useEffect(() => { const id = window.setTimeout(() => setSplash(false), 1700); return () => window.clearTimeout(id); }, []);
  useEffect(() => { if (pal) { setPalQ(''); setPalI(0); window.setTimeout(() => palRef.current?.focus(), 30); } }, [pal]);

  const actions = useRef<{ toggle: () => Promise<unknown>; updateConfigs: () => unknown; rescan: () => unknown; testAll: () => unknown }>({ toggle: async () => {}, updateConfigs: () => {}, rescan: () => {}, testAll: () => {} });

  // کیبورد
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (e.key === 'F11') { e.preventDefault(); await win.setFullscreen(!(await win.isFullscreen())); }
      if (e.ctrlKey && k === 'i') { e.preventDefault(); setImportOpen(true); }
      if (e.key === 'Escape') { setPal(false); setImportOpen(false); if (await win.isFullscreen()) await win.setFullscreen(false); }
      if (e.key === 'F5') { e.preventDefault(); actions.current.updateConfigs(); }
      if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); actions.current.toggle(); }
      if (e.ctrlKey && k === 't') { e.preventDefault(); actions.current.testAll(); }
      if (e.ctrlKey && k === 'r') { e.preventDefault(); actions.current.rescan(); }
      if (e.ctrlKey && k === 'k') { e.preventDefault(); setPal((v) => !v); }
      if (e.ctrlKey && k === 'f') { e.preventDefault(); setPage('servers'); window.setTimeout(() => searchRef.current?.focus(), 200); }
      if (e.ctrlKey && ['1', '2', '3', '4'].includes(e.key)) { e.preventDefault(); setPage(PAGES[Number(e.key) - 1]); }
    };
    const onResize = () => { if (!IS_ANDROID) win.isMaximized().then(setMaxed).catch(() => {}); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    onResize();
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
  }, []); // eslint-disable-line

  // ripple + spotlight
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.rp');
      if (!el || (el as HTMLButtonElement).disabled) return;
      const r = el.getBoundingClientRect();
      const s = document.createElement('span');
      const size = Math.max(r.width, r.height) * 2.2;
      s.className = 'ripple';
      s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
      el.appendChild(s);
      window.setTimeout(() => s.remove(), 700);
    };
    const onMove = (e: PointerEvent) => {
      const el = (e.target as HTMLElement).closest?.<HTMLElement>('.glass, .srv');
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('pointermove', onMove);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('pointermove', onMove); };
  }, []);

  useEffect(() => {
    if (status === 'connected') return;
    const id = window.setInterval(() => setNow(Date.now()), 20000);
    return () => window.clearInterval(id);
  }, [status]);

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.slice(-2), { id, msg, type }]);
    window.setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4500);
  };
  /** اگه کار از منوی tray شروع شده و پنجره مخفیه، بیارش جلو تا کاربر خطا رو ببینه */
  const surface = () => { if (fromTray.current) invoke('show_main').catch(() => {}); };
  const fail = (msg: string) => {
    surface();
    setShake(true);
    window.setTimeout(() => setShake(false), 600);
    showToast(msg, 'err');
  };

  useEffect(() => { if (!links.length) updateConfigs(); }, []); // eslint-disable-line

  // مانیتور اتصال، تایمر و سرعت
  useEffect(() => {
    if (status !== 'connected') return;
    const id = window.setInterval(async () => {
      setNow(Date.now());
      if (testingRef.current) return;
      const ok = await invoke<boolean>('core_running').catch(() => false);
      if (!ok && !testingRef.current) {
        setStatus('idle'); setActiveId(null); setIp(null);
        fail(T.dropped);
        return;
      }
      const st = await invoke<[number, number]>('core_stats').catch(() => null);
      if (st) {
        const prev = lastStats.current;
        if (prev) {
          const up = Math.max(0, st[0] - prev[0]), down = Math.max(0, st[1] - prev[1]);
          setSpeed({ up, down, total: st[0] + st[1] });
          setHist((h) => [...h.slice(-(HIST - 1)), { d: down, u: up }]);
        }
        lastStats.current = st;
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [status, lang]); // eslint-disable-line

  async function checkIp() {
    setIp('loading');
    try {
      const j = JSON.parse(await invoke<string>('get_ip', { port: PROXY_PORT }));
      if (j.status !== 'success') throw new Error('ip');
      setIp(j);
    } catch {
      setIp('fail');
      showToast(T.noNet, 'err');
    }
  }

  /** همه‌ی منبع‌های فعال رو موازی می‌گیره؛ ساب شخصی کامل، ساب‌های عمومی میرن برای اسکن */
  async function fetchSources() {
    const srcs = sources.filter((x) => !subOff.includes(x.id));
    if (!srcs.length) throw new Error(T.noSources);
    const res = await Promise.allSettled(srcs.map((x) => invoke<string>('fetch_text', { urls: x.urls })));
    const own: VNode[] = [], pub: VNode[] = [], failed: string[] = [];
    let skipped = 0;
    res.forEach((r, i) => {
      if (r.status !== 'fulfilled') { failed.push(srcs[i].name); return; }
      const p = parseLinks(decodeSubscription(r.value));
      skipped += p.skipped;
      (srcs[i].kind === 'own' ? own : pub).push(...p.nodes);
    });
    if (failed.length === srcs.length) {
      const r0 = res.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      throw new Error(errMsg(r0?.reason ?? T.fetchErr));
    }
    return { own, pub, skipped, failed };
  }

  /**
   * دریافت کانفیگ + اسکن هوشمند.
   * reuse=true: ساب رو دوباره دانلود نمی‌کنه، فقط با همون استخر قبلی دوباره سریع‌ترین‌ها رو پیدا می‌کنه
   */
  async function updateConfigs(reuse = false) {
    if (busy || status === 'connecting') return;
    setBusy('fetch');
    setScan({ phase: 'fetch', pool: 0, tcpDone: 0, tcpTotal: 0, alive: 0, tested: 0, ok: 0, target: topN });
    testingRef.current = true;
    const reconnect = status === 'connected' && mode === 'tun' && !IS_ANDROID ? active : undefined;
    let stopped = false;
    try {
      let own: VNode[], pub: VNode[], skipped = 0, failed: string[] = [];
      if (reuse && poolRef.current) {
        own = nodes.filter((n) => srcOf[n.id] !== 'pub');
        pub = poolRef.current;
      } else {
        ({ own, pub, skipped, failed } = await fetchSources());
        poolRef.current = pub;
        // کانفیگ‌های دستی (v2.4) همیشه جزو شخصی‌ها می‌مونن
        const oid = new Set(own.map((n) => n.id));
        own = [...own, ...parseLinks(manual).nodes.filter((n) => !oid.has(n.id))];
      }
      const ownIds = new Set(own.map((n) => n.id));
      pub = pub.filter((n) => !ownIds.has(n.id));
      if (!own.length && !pub.length) throw new Error(T.noValid);

      // تست باید با نت خود کاربر باشه، نه از داخل تونل TUN
      if (reconnect) { await invoke('stop_core').catch(() => {}); stopped = true; }
      setBusy('scan');

      let top: VNode[] = [], p: Record<string, number> = {}, poolSize = 0;
      if (pub.length) {
        const r = await smartScan(pub, topN, setScan);
        top = r.top; p = { ...r.pings }; poolSize = r.state.pool;
        setLastScan({ pool: r.state.pool, alive: r.state.alive, tested: r.state.tested, ok: r.state.ok, picked: top.length, ms: r.ms, at: Date.now() });
      }
      if (own.length) {
        const ro = await realTest(own);
        own.forEach((n, i) => (p[n.id] = ro[i]));
      }
      // علاقه‌مندی‌های قبلی از ساب عمومی حذف نمیشن
      const keep = nodes.filter((n) => favs.includes(n.id) && srcOf[n.id] === 'pub' && !top.some((x) => x.id === n.id) && !ownIds.has(n.id));
      const all = [...own, ...top, ...keep];
      if (!all.length) throw new Error(T.noWorking);

      const src: Record<string, Src> = {};
      own.forEach((n) => (src[n.id] = 'own'));
      [...top, ...keep].forEach((n) => (src[n.id] = 'pub'));
      setLinks(all.map((n) => n.link));
      setSrcOf(src);
      setPicks(top.map((n) => n.id));
      setPings(p);
      setFetchedAt(Date.now());
      setFavs((f) => f.filter((id) => all.some((n) => n.id === id)));
      if (!all.some((n) => n.id === selected)) setSelected(all[0].id);
      showToast(pub.length ? T.scanDone(top.length, poolSize, own.length) : T.updated(all.length, skipped), 'ok');
      if (failed.length) showToast(T.srcFailed(failed.join('، ')), 'err');
    } catch (e) {
      fail(`${T.fetchErr}: ${errMsg(e)}`);
    } finally {
      if (stopped && reconnect) await startNode(reconnect).catch((e) => { setStatus('idle'); setActiveId(null); fail(`${T.connErr}: ${errMsg(e)}`); });
      testingRef.current = false;
      setBusy('');
      setScan(null);
    }
  }
  const refetch = () => updateConfigs(false);
  const rescan = () => updateConfigs(true);

  async function runTest(list: VNode[]): Promise<Record<string, number>> {
    const res: Record<string, number> = {};
    if (!list.length) return res;
    const arr = await realTest(list, { onItem: () => {} });
    list.forEach((n, i) => (res[n.id] = arr[i]));
    return res;
  }

  async function startNode(n: VNode) {
    await invoke('start_core', {
      config: JSON.stringify(buildConfig(n, mode, PROXY_PORT)),
      systemProxy: mode === 'proxy',
      port: PROXY_PORT,
    });
    onUp(n.id);
  }

  /** بعد از بالا اومدن تونل (هر دو مدل) */
  function onUp(id: string | null) {
    lastStats.current = null;
    setSpeed({ up: 0, down: 0, total: 0 });
    setHist([]);
    setActiveId(id);
    setSince(Date.now());
    setNow(Date.now());
    setStatus('connected');
    setStep('');
    setFlash((f) => f + 1);
    checkIp();
  }

  async function testAll() {
    if (busy || status === 'connecting' || !nodes.length) return;
    setBusy('test');
    testingRef.current = true;
    const reconnect = status === 'connected' && mode === 'tun' && !IS_ANDROID ? active : undefined;
    if (reconnect) await invoke('stop_core').catch(() => {});
    setPings({});
    const res = await runTest(nodes);
    setPings(res);
    if (reconnect) await startNode(reconnect).catch((e) => { setStatus('idle'); fail(`${T.connErr}: ${errMsg(e)}`); });
    testingRef.current = false;
    setBusy('');
  }

  async function disconnect() {
    await invoke('stop_core').catch(() => {});
    setStatus('idle');
    setActiveId(null);
    setIp(null);
  }

  /**
   * v2.5 · مدل ۲: اول Aether بالا میاد و گیت‌وی سالم پیدا می‌کنه (SOCKS روی 1819)،
   * بعد sing-box جلوش TUN یا پروکسی ویندوز رو راه می‌ندازه. همه‌چی داخل خود برنامه.
   */
  async function connectAether() {
    if (mode === 'tun' && !(await invoke<boolean>('is_admin').catch(() => false))) { surface(); return setAdminAsk(true); }
    setStatus('connecting'); setStep('aether'); setAeLog(''); setAeSince(Date.now()); setNow(Date.now());
    try {
      await invoke('start_aether', { protocol: aeProto, scan: aeScan, h2: aeH2 });
      setStep('start');
      await invoke('start_core', {
        config: JSON.stringify(buildAetherConfig(mode, PROXY_PORT)),
        systemProxy: mode === 'proxy',
        port: PROXY_PORT,
      });
      onUp(null);
    } catch (e) {
      await invoke('stop_core').catch(() => {});
      setStatus('idle'); setStep('');
      if (String(e) !== 'cancelled') fail(`${T.connErr}: ${errMsg(e)}`);
    }
  }

  async function toggle() {
    // اسکن Aether ممکنه طول بکشه؛ زدن دوباره‌ی دکمه = لغو
    if (status === 'connecting' && engine === 'aether' && step === 'aether') { await invoke('stop_core').catch(() => {}); return; }
    if (status === 'connecting' || busy) return;
    if (status === 'connected') return disconnect();
    if (engine === 'aether') return connectAether();
    if (!nodes.length) return fail(T.noConfigs);
    if (mode === 'tun' && !(await invoke<boolean>('is_admin').catch(() => false))) { surface(); return setAdminAsk(true); }

    setStatus('connecting');
    try {
      let order: VNode[];
      if (auto) {
        let p = pings;
        if (!nodes.some((n) => (p[n.id] ?? -1) > 0)) {
          setStep('test');
          testingRef.current = true;
          p = await runTest(nodes);
          setPings(p);
          testingRef.current = false;
        }
        order = nodes.filter((n) => (p[n.id] ?? -1) > 0).sort((a, b) => p[a.id] - p[b.id]).slice(0, 3);
        if (!order.length) throw new Error(T.noWorking);
      } else {
        order = [nodes.find((n) => n.id === selected) || nodes[0]];
      }
      setStep('start');
      let last: unknown;
      for (const n of order) {
        try { await startNode(n); setSelected(n.id); return; } catch (e) { last = e; }
      }
      throw last;
    } catch (e) {
      testingRef.current = false;
      setStatus('idle');
      setStep('');
      fail(`${T.connErr}: ${errMsg(e)}`);
    }
  }

  async function pick(n: VNode) {
    setSelected(n.id);
    setAuto(false);
    if (engine === 'aether') return; // موقع اتصال مدل ۲ فقط انتخاب میشه
    if (status === 'connected' && n.id !== activeId) {
      setStatus('connecting');
      setStep('switch');
      await startNode(n).catch((e) => { setStatus('idle'); setStep(''); setActiveId(null); fail(`${T.connErr}: ${errMsg(e)}`); });
    }
  }

  /** مستقیم وصل شو به یه سرور مشخص (از لیست یا پالت) */
  async function connectTo(n: VNode) {
    if (status === 'connecting' || busy) return;
    if (status === 'connected') return pick(n);
    setSelected(n.id); setAuto(false);
    if (engine === 'aether') setEngine('v2'); // وصل شدن به یه سرور مشخص یعنی مدل ۱
    if (mode === 'tun' && !(await invoke<boolean>('is_admin').catch(() => false))) return setAdminAsk(true);
    setStatus('connecting'); setStep('start');
    await startNode(n).catch((e) => { setStatus('idle'); setStep(''); fail(`${T.connErr}: ${errMsg(e)}`); });
  }

  async function connectFastest() {
    if (status === 'connecting' || busy || !nodes.length) return;
    let p = pings;
    if (!nodes.some((n) => (p[n.id] ?? -1) > 0)) {
      setBusy('test'); testingRef.current = true;
      p = await runTest(nodes); setPings(p);
      testingRef.current = false; setBusy('');
    }
    const ok = nodes.filter((n) => (p[n.id] ?? -1) > 0).sort((a, b) => p[a.id] - p[b.id]);
    if (!ok.length) return fail(T.noWorking);
    await connectTo(ok[0]);
  }

  function addSub() {
    const raw = newSub.trim();
    if (!/^https?:\/\/\S+$/.test(raw)) return;
    if (sources.some((x) => x.urls.includes(raw))) { showToast(T.subExists, 'err'); return; }
    let name = '';
    try { const u = new URL(raw); name = decodeURIComponent(u.hash.slice(1)) || u.hostname; } catch { name = raw; }
    setCustomSubs((c) => [...c, { id: `c${Date.now().toString(36)}`, name, url: raw }]);
    setNewSub('');
    showToast(T.subAdded, 'ok');
  }

  /* ---------- v2.4: افزودن دستی، کپی کانفیگ، بررسی آپدیت ---------- */
  async function importConfigs() {
    const p = parseLinks(decodeSubscription(importText));
    const added = p.nodes.filter((n) => !nodes.some((x) => x.id === n.id));
    if (!p.nodes.length) return fail(T.importNone);
    setManual((m) => Array.from(new Set([...m, ...p.nodes.map((n) => n.link)])));
    setLinks((l) => Array.from(new Set([...l, ...added.map((n) => n.link)])));
    setSrcOf((x) => { const y = { ...x }; p.nodes.forEach((n) => (y[n.id] = 'own')); return y; });
    if (!selected && added[0]) setSelected(added[0].id);
    setImportOpen(false); setImportText('');
    showToast(T.imported(p.nodes.length), 'ok');
    if (added.length && !busy && status !== 'connected') {
      setBusy('test');
      const r = await runTest(added).catch(() => ({} as Record<string, number>));
      setPings((x) => ({ ...x, ...r }));
      setBusy('');
    }
  }
  async function pasteClip() {
    try { const v = await navigator.clipboard.readText(); if (v) setImportText((t0) => (t0 ? `${t0.trimEnd()}\n${v}` : v)); } catch { showToast(T.clipFail, 'err'); }
  }
  const copyCfg = (n?: VNode) => { if (n) navigator.clipboard?.writeText(n.link).then(() => showToast(T.cfgCopied, 'ok')).catch(() => {}); };
  function clearManual() {
    const ids = new Set(parseLinks(manual).nodes.map((n) => n.id));
    setLinks((l) => parseLinks(l).nodes.filter((n) => !ids.has(n.id) || n.id === activeId).map((n) => n.link));
    setManual([]);
    showToast(T.manualCleared, 'ok');
  }
  async function checkUpdate(silent = false) {
    if (!RELEASE_API) { if (!silent) showToast(T.noRepo, 'err'); return; }
    setUpd('checking');
    try {
      const j = JSON.parse(await invoke<string>('fetch_text', { urls: [RELEASE_API] }));
      const tag = String(j.tag_name || '').replace(/^v/, '');
      if (tag && newer(tag, VERSION)) { setUpd(tag); showToast(T.newVer(tag), 'ok'); }
      else { setUpd('latest'); if (!silent) showToast(T.upToDate(VERSION), 'ok'); }
    } catch { setUpd(''); if (!silent) showToast(T.updFail, 'err'); }
  }
  const openRelease = () => invoke('open_url', { url: RELEASE_PAGE }).catch((e) => showToast(errMsg(e), 'err'));
  useEffect(() => { const id = window.setTimeout(() => checkUpdate(true), 4000); return () => window.clearTimeout(id); }, []); // eslint-disable-line
  const hasUpd = upd !== '' && upd !== 'checking' && upd !== 'latest';

  const toggleFav = (id: string) => setFavs((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  const copyIp = () => {
    if (ip && typeof ip === 'object') navigator.clipboard?.writeText(ip.query).then(() => showToast(T.copied, 'ok')).catch(() => {});
  };
  const onMag = (e: RME) => {
    if (reduce || !magRef.current) return;
    const r = magRef.current.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    magRef.current.style.transform = `translate(${dx * 0.12}px, ${dy * 0.12}px)`;
  };
  const offMag = () => { if (magRef.current) magRef.current.style.transform = ''; };

  actions.current = { toggle, updateConfigs: refetch, rescan, testAll };

  // tray: کلیک «اتصال/قطع» از منوی راست‌کلیک آیکون کنار ساعت
  useEffect(() => {
    const un = listen('tray-toggle', async () => {
      fromTray.current = true;
      try { await actions.current.toggle(); } finally { fromTray.current = false; }
    });
    return () => { un.then((f) => f()).catch(() => {}); };
  }, []);

  // اتصال خودکار موقع باز شدن برنامه (یه بار، وقتی سرورها آماده‌ان)
  const autoDone = useRef(false);
  useEffect(() => {
    if (autoDone.current || !autoConnect || splash || (engine === 'v2' && !nodes.length) || status !== 'idle' || busy) return;
    autoDone.current = true;
    fromTray.current = true; // اگه پنجره مخفیه و خطا داد، بیارش جلو
    actions.current.toggle().finally(() => { fromTray.current = false; });
  }, [autoConnect, splash, nodes.length, status, busy, engine]);

  // اعلان ویندوز وقتی پنجره مخفیه (Rust خودش چک می‌کنه)
  const prevStatus = useRef<Status>('idle');
  useEffect(() => {
    const prev = prevStatus.current; prevStatus.current = status;
    if (status === 'connected' && prev !== 'connected') invoke('notify', { title: T.notifyOn, body: engine === 'aether' ? `${T.m2} · Aether` : active ? splitFlag(active.name).label : 'MahyarVPN' }).catch(() => {});
    if (status === 'idle' && prev === 'connected') invoke('notify', { title: T.notifyOff, body: 'MahyarVPN' }).catch(() => {});
  }, [status]); // eslint-disable-line

  /* ---------- derived ---------- */
  const label = status === 'connected' ? T.connected : status === 'connecting' ? T.connecting : T.idle;
  const stepText = step === 'test' ? T.stepTest : step === 'start' ? T.stepStart : step === 'switch' ? T.stepSwitch : step === 'aether' ? T.stepAether : '';
  const activeLabel = engine === 'aether' && status !== 'idle' ? 'Aether' : active ? splitFlag(active.name).label : '';
  const lite = engine === 'aether';
  const aeSecs = Math.max(0, Math.floor((now - aeSince) / 1000));
  const ipCc = ip && typeof ip === 'object' ? ip.countryCode : undefined;
  const stepList: Step[] = lite ? ['aether', 'start'] : ['test', 'start'];
  useEffect(() => {
    const st = status === 'connected' ? `● ${T.connected}${activeLabel ? ` · ${activeLabel}` : ''}` : status === 'connecting' ? `◌ ${T.connecting}...` : `○ ${T.idle}`;
    invoke('set_tray', {
      connected: status === 'connected',
      status: st,
      toggle: status === 'connected' ? T.disconnect : T.connect,
      toggleEnabled: status !== 'connecting',
      show: T.trayShow,
      quit: T.trayQuit,
      tooltip: `MahyarVPN · ${status === 'connected' ? T.connected : status === 'connecting' ? T.connecting : T.idle}${activeLabel ? ` · ${activeLabel}` : ''}`,
    }).catch(() => {});
  }, [status, lang, activeLabel]); // eslint-disable-line
  const EnginePick = (
    <div className={`eng ${status !== 'idle' ? 'locked' : ''}`} role="radiogroup" aria-label={T.engine} title={status !== 'idle' ? T.lockedWhileOn : T.engine}>
      <span className="eng-glow" data-e={engine} />
      {(['v2', 'aether'] as Engine[]).map((e) => (
        <button key={e} role="radio" aria-checked={engine === e} className={`eng-b ${engine === e ? 'on' : ''}`} disabled={status !== 'idle'} onClick={() => setEngine(e)}>
          <span className="eng-ic">{e === 'v2' ? I.layers : I.aether}</span>
          <span className="eng-tx"><b>{e === 'v2' ? T.m1 : T.m2}</b><small>{e === 'v2' ? T.m1Sub : T.m2Sub}</small></span>
        </button>
      ))}
    </div>
  );
  const ModeCard = (
    <Card className="mode-card">
      <div className="lbl">{T.modeTitle}{status !== 'idle' && <span className="lbl-lock">{I.lock}{T.lockedWhileOn}</span>}</div>
      <div className="mode-pick">
        {(['tun', 'proxy'] as Mode[]).map((m) => (
          <button key={m} className={`mp rp ${mode === m ? 'on' : ''}`} disabled={status !== 'idle'} onClick={() => setMode(m)}>
            <span className="mp-ic">{m === 'tun' ? I.cpu : I.proxy}</span>
            <span className="mp-tx"><b>{m === 'tun' ? 'TUN' : 'Proxy'}</b><small>{m === 'tun' ? T.tunHint : T.proxyHint}</small></span>
          </button>
        ))}
      </div>
    </Card>
  );
  const mins = fetchedAt ? Math.max(0, Math.floor((now - fetchedAt) / 60000)) : -1;
  const updatedText = mins < 0 ? T.never : mins < 1 ? T.justNow : T.ago(mins);
  const fresh = mins < 0 ? 'bad' : mins < 60 ? 'good' : mins < 360 ? 'mid' : 'bad';
  const freshText = fresh === 'good' ? T.fresh : fresh === 'mid' ? T.aging : T.stale;
  const downs = hist.map((x) => x.d), ups = hist.map((x) => x.u);
  const peak = downs.length ? Math.max(...downs) : 0;
  const avg = downs.length ? downs.reduce((a, b) => a + b, 0) / downs.length : 0;
  const buckets = useMemo(() => {
    const b = [0, 0, 0, 0, 0, 0];
    nodes.forEach((n) => { const p = pings[n.id]; if (p === undefined) return; if (p < 0) b[5]++; else if (p < 150) b[0]++; else if (p < 300) b[1]++; else if (p < 500) b[2]++; else if (p < 800) b[3]++; else b[4]++; });
    return b;
  }, [nodes, pings]);
  const protoCount = useMemo(() => protocols.map((p) => [p, nodes.filter((n) => n.protocol === p).length] as const), [protocols, nodes]);
  const vars = { '--a1': a1, '--a2': a2, '--st': ST[status] } as CSSProperties;

  /* ---------- command palette ---------- */
  type PItem = { id: string; icon: ReactNode; label: string; hint?: string; run: () => void; group: string };
  const palItems: PItem[] = useMemo(() => {
    const A: PItem[] = [
      { id: 'tog', group: T.actions, icon: I.power, label: status === 'connected' ? T.disconnect : T.connect, hint: 'Ctrl+Enter', run: toggle },
      { id: 'fast', group: T.actions, icon: I.bolt, label: T.fastest, run: connectFastest },
      { id: 'cfg', group: T.actions, icon: I.refresh, label: T.getConfigs, hint: 'F5', run: refetch },
      { id: 'scan', group: T.actions, icon: I.radar, label: T.rescan, hint: 'Ctrl+R', run: rescan },
      { id: 'imp', group: T.actions, icon: I.paste, label: T.importCfg, hint: 'Ctrl+I', run: () => setImportOpen(true) },
      { id: 'upd', group: T.actions, icon: I.rocket, label: T.checkUpd, run: () => checkUpdate() },
      { id: 'ping', group: T.actions, icon: I.pulse, label: T.testPing, hint: 'Ctrl+T', run: testAll },
      { id: 'eng', group: T.actions, icon: engine === 'v2' ? I.aether : I.layers, label: `${T.engine}: ${engine === 'v2' ? T.m2 : T.m1}`, run: () => status === 'idle' && setEngine(engine === 'v2' ? 'aether' : 'v2') },
      { id: 'mode', group: T.actions, icon: mode === 'tun' ? I.proxy : I.cpu, label: `${T.switchMode} ${mode === 'tun' ? 'Proxy' : 'TUN'}`, run: () => status === 'idle' && setMode(mode === 'tun' ? 'proxy' : 'tun') },
      { id: 'lang', group: T.actions, icon: I.lang, label: T.toggleLang, run: () => setLang(lang === 'fa' ? 'en' : 'fa') },
      ...(Object.keys(THEMES) as Theme[]).map((th) => ({ id: 'th-' + th, group: T.theme, icon: I.palette, label: T.themes[th], run: () => setTheme(th) })),
      ...PAGES.map((p, i) => ({ id: 'pg-' + p, group: T.goTo, icon: [I.home, I.servers, I.stats, I.settings][i], label: [T.home, T.servers, T.stats, T.settings][i], hint: `Ctrl+${i + 1}`, run: () => setPage(p) })),
      ...nodes.map((n) => { const f = splitFlag(n.name); const p = pings[n.id]; return { id: 'n-' + n.id, group: T.servers, icon: <Flag cc={f.cc} size="s" />, label: f.label, hint: p === undefined ? n.protocol : p < 0 ? T.timeout : `${p}ms`, run: () => connectTo(n) }; }),
    ];
    const q = palQ.trim().toLowerCase();
    return q ? A.filter((x) => x.label.toLowerCase().includes(q) || x.group.toLowerCase().includes(q) || (x.hint ?? '').toLowerCase().includes(q)) : A.filter((x) => !x.id.startsWith('n-')).concat(A.filter((x) => x.id.startsWith('n-')).slice(0, 6));
  }, [palQ, status, mode, engine, lang, nodes, pings, T, auto, busy, selected, activeId]); // eslint-disable-line
  const runPal = (it?: PItem) => { if (!it) return; setPal(false); window.setTimeout(it.run, 60); };

  /* ================= PAGES ================= */
  const Dashboard = (
    <div className={`pg dash ${lite ? 'lite' : ''}`}>
      <Card className="stage">
        <div className="stage-top">
          <span className="st-dot solo" title={label} />
          <WaveName />
          <div className="st-mode">{mode === 'tun' ? I.cpu : I.proxy}{mode.toUpperCase()}</div>
        </div>
        <div className="globe-wrap"><Globe status={status} markers={lite ? [] : markers} target={status !== 'idle' ? (lite ? ipCc : active ? splitFlag(active.name).cc : undefined) : undefined} a1={a1} a2={a2} st={ST[status]} reduce={reduce} /></div>
        <div className="core-area">
          <div className="mag" ref={magRef} onMouseMove={onMag} onMouseLeave={offMag}>
            <button className={`core ${status} ${shake ? 'shake' : ''}`} onClick={toggle} disabled={!!busy && status !== 'connected'} aria-label={status === 'connected' ? T.disconnect : T.connect}>
              <span className="core-halo" />
              <span className="core-ring" />
              <svg className="core-arc" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" /></svg>
              {flash > 0 && <span className="shock" key={flash} />}
              <span className="core-in">
                <span className="core-ic"><CoreIcon status={status} /></span>
                <span className="core-tx">{status === 'connected' ? T.disconnect : status === 'connecting' ? (lite && step === 'aether' ? T.cancel : '...') : T.connect}</span>
              </span>
            </button>
          </div>
          <div className="core-label">
            <b key={label}>{status === 'connecting' && stepText ? stepText : label}</b>
            {status === 'connected'
              ? <span className="timer mono" data-on="true">{fmtTime(now - since)}</span>
              : status === 'connecting' && lite && step === 'aether'
                ? <small className="ae-log" dir="ltr" title={aeLog}><span className="mono">{aeSecs}s</span>{aeLog || T.wait}</small>
                : <small>{status === 'connecting' ? T.wait : T.tapConnect}</small>}
          </div>
          {EnginePick}
        </div>
        {status === 'connecting' && <div className="steps">{stepList.map((s, i) => <i key={s} className={step === s || (step === 'start' && i === 0) || step === 'switch' ? 'on' : ''} />)}</div>}
      </Card>

      {lite ? (
      /* v2.5 · مدل ۲: صفحه‌ی خلوت، فقط روش اتصال */
      <div className="side lite-side">
        {ModeCard}
        <Card className="ae-card">
          <span className="ae-badge">{I.aether}</span>
          <div className="ae-tx"><b>Aether · {AE_PROTOS.find((x) => x[0] === aeProto)?.[1]}{aeProto === 'masque' && aeH2 ? ' · h2' : ''}</b><small>{T.m2Hint}</small></div>
          <button className="tb sm" onClick={() => setPage('settings')} data-tip={T.settings}>{I.settings}</button>
        </Card>
      </div>
      ) : (
      <div className="side">
        {/* v2.4 · کارهای سریع: دریافت کانفیگ همیشه دم دسته */}
        <Card className="dock">
          {hasUpd && (
            <button className="upd-pill rp" onClick={openRelease}>{I.rocket}<span>{T.newVer(upd)}</span><b>{T.download}</b></button>
          )}
          <button className={`get-cfg rp ${busy === 'fetch' || busy === 'scan' ? 'busy' : ''}`} onClick={refetch} disabled={!!busy || status === 'connecting'}>
            <span className="gc-ic"><span className={busy === 'fetch' || busy === 'scan' ? 'spin' : ''}>{I.refresh}</span></span>
            <span className="gc-tx">
              <b>{busy === 'fetch' ? T.fetching : busy === 'scan' ? T.scanning : T.getConfigs}</b>
              <small title={freshText}><i className={`fr ${fresh}`} />{mins < 0 ? T.getConfigsSub : updatedText}{nodes.length ? ` · ${nodes.length} ${T.configs}` : ''}</small>
            </span>
            <kbd className="gc-k">F5</kbd>
          </button>
          <div className="acts">
            <button className="act rp" onClick={rescan} disabled={!!busy || status === 'connecting'} title="Ctrl+R">
              <span className={busy === 'scan' ? 'spin' : ''}>{I.radar}</span><span>{T.rescan}</span>
            </button>
            <button className="act rp" onClick={testAll} disabled={!!busy || status === 'connecting' || !nodes.length} title="Ctrl+T">
              <span className={busy === 'test' ? 'pulse' : ''}>{I.pulse}</span><span>{busy === 'test' ? T.testing : T.testPing}</span>
            </button>
            <button className="act rp" onClick={() => setImportOpen(true)} title="Ctrl+I">
              {I.paste}<span>{T.importCfg}</span>
            </button>
          </div>
        </Card>

        {scan ? (
        <Card className="srv-card scan-card"><ScanPanel s={scan} T={T} compact /></Card>
        ) : !nodes.length ? (
        <Card className="srv-card empty-home">
          <div className="eh-ic">{I.servers}</div>
          <b>{T.noConfigs}</b>
          <small>{T.emptyHint}</small>
        </Card>
        ) : (
        <Card className="srv-card">
          <div className="lbl">{status === 'connected' ? T.current : T.location}</div>
          <div className="srv-row">
            <Flag cc={shownFlag?.cc || (auto ? 'AI' : '')} size="l" />
            <div className="srv-txt">
              <b dir="auto">{shownNode ? shownFlag?.label : auto ? T.autoPick : '—'}</b>
              <span className="tags">{shownNode ? <><em className={`p-${shownNode.protocol}`}>{shownNode.protocol}</em>{transportOf(shownNode) && <em>{transportOf(shownNode)}</em>}</> : <em>{nodes.length} {T.servers}</em>}</span>
            </div>
            {shownNode && pings[shownNode.id] !== undefined && <div className={`big-ping ${pingClass(pings[shownNode.id])}`}><Meter p={pings[shownNode.id]} /><span className="mono">{pings[shownNode.id] < 0 ? '×' : pings[shownNode.id]}</span></div>}
          </div>
          {quick.length > 0 && (
            <div className="quick">
              {quick.map((n) => { const f = splitFlag(n.name), p = pings[n.id]; return (
                <button key={n.id} className={`qchip rp ${n.id === activeId ? 'on' : ''}`} onClick={() => connectTo(n)} disabled={!!busy || status === 'connecting'} title={f.label}>
                  <Flag cc={f.cc} size="s" />
                  <span className="q-n" dir="auto">{f.label}</span>
                  <b className={`mono ${pingClass(p)}`}>{p}<small>ms</small></b>
                </button>
              ); })}
            </div>
          )}
          <div className="row3">
            <button className="btn rp" onClick={() => setPage('servers')}>{I.servers}{T.change}</button>
            <button className="btn sq rp" onClick={() => copyCfg(shownNode)} disabled={!shownNode} title={T.copyCfg} aria-label={T.copyCfg}>{I.copy}</button>
            <button className="btn accent rp" onClick={connectFastest} disabled={!!busy || status === 'connecting' || !nodes.length}>{I.bolt}{T.fastest}</button>
          </div>
        </Card>
        )}

        {status === 'connected' ? (
        <>
        <div className="tiles">
          <Card className="tile dl">
            <div className="tile-h"><span className="ti">{I.down}</span>{T.down}</div>
            <div className="tile-v mono"><Count value={speed.down} fmt={(v) => fmtBytes(v)} /><small>/s</small></div>
            <Area id="sd" n={30} h={36} series={[{ data: downs, color: '#22d3ee' }]} />
          </Card>
          <Card className="tile ul">
            <div className="tile-h"><span className="ti">{I.up}</span>{T.up}</div>
            <div className="tile-v mono"><Count value={speed.up} fmt={(v) => fmtBytes(v)} /><small>/s</small></div>
            <Area id="su" n={30} h={36} series={[{ data: ups, color: '#ff4fd8' }]} />
          </Card>
        </div>
        <Card className="info">
          <button className="info-row rp" onClick={copyIp} disabled={!ip || typeof ip !== 'object'}>
            <span className="ii">{I.globe}</span>
            <span className="info-k">{T.ip}</span>
            <span className="info-v mono">{ip === 'loading' ? <span className="skel" /> : ip && typeof ip === 'object' ? <><Flag cc={ip.countryCode} size="s" />{ip.query}<span className="cp">{I.copy}</span></> : '—'}</span>
          </button>
          <div className="info-row">
            <span className="ii">{I.stats}</span>
            <span className="info-k">{T.total}</span>
            <span className="info-v mono"><Count value={speed.total} fmt={fmtBytes} /></span>
          </div>
          <div className="info-row">
            <span className="ii">{I.lock}</span>
            <span className="info-k">{T.mode}</span>
            <span className="info-v mono">{mode.toUpperCase()}</span>
          </div>
        </Card>
        </>
        ) : ModeCard}
      </div>
      )}
    </div>
  );

  const Servers = (
    <div className="pg servers">
      <div className="pg-head">
        <div>
          <h1>{T.servers}</h1>
          <p className="pg-sub"><span className="chip-n">{nodes.length}</span>{tested > 0 && <span className="on-n"><i />{online} {T.online}</span>}<span className="muted">· {T.lastUpdate}: {updatedText}</span></p>
        </div>
        <div className="head-actions">
          <div className="tgroup">
            <button className="tb" onClick={refetch} disabled={!!busy || status === 'connecting'} data-tip={`${T.getConfigs} · F5`}><span className={busy === 'fetch' ? 'spin' : ''}>{I.refresh}</span></button>
            <button className="tb" onClick={rescan} disabled={!!busy || status === 'connecting'} data-tip={`${T.rescan} · Ctrl+R`}><span className={busy === 'scan' ? 'spin' : ''}>{I.radar}</span></button>
            <button className="tb" onClick={testAll} disabled={!!busy || status === 'connecting' || !nodes.length} data-tip={`${T.testPing} · Ctrl+T`}><span className={busy === 'test' ? 'pulse' : ''}>{I.pulse}</span></button>
            <span className="tg-sep" />
            <button className={`tb ${sortPing ? 'on' : ''}`} onClick={() => setSortPing(!sortPing)} data-tip={T.sortPing}>{I.sort}</button>
          </div>
          <button className="btn accent rp" onClick={connectFastest} disabled={!!busy || status === 'connecting' || !nodes.length}>{I.bolt}<span className="hide-s">{T.fastest}</span></button>
        </div>
      </div>
      {scan ? (
        <Card className="scan-card wide"><ScanPanel s={scan} T={T} /></Card>
      ) : (
        <>
          <div className={`bar ${busy ? 'on' : ''}`}><i style={busy === 'test' && tested ? { width: `${(tested / Math.max(1, nodes.length)) * 100}%`, animation: 'none' } : undefined} /></div>
          {lastScan && picks.length > 0 && (
            <div className="scan-strip">
              <span className="ss-ic">{I.radar}</span>
              <span className="ss-t">{T.scanSum(lastScan.pool, lastScan.alive, lastScan.picked, Math.round(lastScan.ms / 1000))}</span>
              <button className="btn sm ghost rp" onClick={rescan} disabled={!!busy || status === 'connecting'}>{I.refresh}{T.rescan}</button>
            </div>
          )}
        </>
      )}
      <div className="toolbar">
        <div className="search">
          {I.search}
          <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={T.search} />
          {query ? <button className="clr" onClick={() => setQuery('')}>{I.x}</button> : <Kbd k="Ctrl+F" />}
        </div>
        {nodes.length > 0 && (
          <div className="chips">
            {['all', 'fav', ...(hasBoth ? ['src-pub', 'src-own'] : []), ...protocols].map((f) => (
              <button key={f} className={`chipf rp ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
                {f === 'fav' && I.star}{f === 'src-pub' && I.radar}{f === 'src-own' && I.lock}{f === 'all' ? T.all : f === 'fav' ? T.favs : f === 'src-pub' ? T.srcPub : f === 'src-own' ? T.srcOwn : f}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid">
        {!nodes.length && (
          <div className="empty">
            <div className="empty-art"><span /><span /><span />{I.servers}</div>
            <b>{T.noConfigs}</b><p>{T.emptyHint}</p>
            <button className="btn accent rp" onClick={refetch} disabled={!!busy}><span className={busy === 'fetch' ? 'spin' : ''}>{I.refresh}</span>{busy === 'fetch' ? T.fetching : T.getConfigs}</button>
          </div>
        )}
        {nodes.length > 0 && !shown.length && <div className="empty small">{T.noMatch}</div>}
        {shown.map((n, i) => {
          const p = pings[n.id], f = splitFlag(n.name), tr = transportOf(n);
          const isSel = !auto && n.id === selected, isAct = n.id === activeId, isFav = favs.includes(n.id);
          const rk = rankOf.get(n.id);
          return (
            <div key={n.id} role="button" tabIndex={0} className={`srv rp ${isSel ? 'sel' : ''} ${isAct ? 'act' : ''}`}
              style={{ animationDelay: `${Math.min(i, 18) * 26}ms` }} onClick={() => pick(n)} onDoubleClick={() => connectTo(n)} onKeyDown={(e) => e.key === 'Enter' && pick(n)}>
              <span className="flag-wrap"><Flag cc={f.cc} />{rk !== undefined && <span className={`rank ${rk < 3 ? `r${rk + 1}` : ''}`}>{rk + 1}</span>}</span>
              <div className="srv-meta">
                <b dir="auto">{f.label}</b>
                <span className="tags"><em className={`p-${n.protocol}`}>{n.protocol}</em>{tr && <em>{tr}</em>}{hasBoth && srcOf[n.id] !== 'pub' && <em className="own">{I.lock}{T.srcOwn}</em>}{n.id === bestId && <em className="best">{I.bolt}{T.best}</em>}</span>
              </div>
              <div className={`srv-ping ${pingClass(p)} ${busy === 'test' && p === undefined ? 'ld' : ''}`}>
                <Meter p={p} />
                <span className="mono pill">{p === undefined ? (busy === 'test' ? '' : '—') : p < 0 ? T.timeout : `${p}ms`}</span>
              </div>
              <span role="button" className={`fav ${isFav ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); toggleFav(n.id); }}>{I.star}</span>
              {isAct && <span className="live">LIVE</span>}
            </div>
          );
        })}
      </div>
    </div>
  );

  const Stats = (
    <div className="pg stats">
      <div className="pg-head"><div><h1>{T.stats}</h1><p className="pg-sub muted">{status === 'connected' ? `${T.session} · ${fmtTime(now - since)}` : T.notConnectedYet}</p></div></div>
      <div className="kpis">
        {[
          { k: T.uptime, v: status === 'connected' ? fmtTime(now - since) : '—', ic: I.clock },
          { k: T.total, v: <Count value={speed.total} fmt={fmtBytes} />, ic: I.stats },
          { k: T.peak, v: <><Count value={peak} fmt={fmtBytes} />/s</>, ic: I.bolt },
          { k: T.avg, v: <><Count value={avg} fmt={fmtBytes} />/s</>, ic: I.down },
        ].map((x, i) => (
          <Card key={i} className="kpi" style={{ animationDelay: `${i * 60}ms` }}>
            <span className="kpi-ic">{x.ic}</span><span className="kpi-k">{x.k}</span><span className="kpi-v mono">{x.v}</span>
          </Card>
        ))}
      </div>
      <Card className="chart">
        <div className="chart-h"><b>{T.liveTraffic}</b><span className="lg"><i className="d" />{T.down}<i className="u" />{T.up}</span></div>
        <Area id="big" n={HIST} h={180} grid series={[{ data: downs, color: '#22d3ee' }, { data: ups, color: '#ff4fd8' }]} />
      </Card>
      <div className="two">
        <Card className="hist">
          <div className="chart-h"><b>{T.pingDist}</b><span className="muted">{tested}/{nodes.length}</span></div>
          <div className="bars">
            {buckets.map((v, i) => {
              const m = Math.max(1, ...buckets);
              return (
                <div key={i} className={`bcol b${i}`}>
                  <span className="bv mono">{v}</span>
                  <span className="bb"><i style={{ height: `${(v / m) * 100}%`, transitionDelay: `${i * 60}ms` }} /></span>
                  <span className="bl mono">{['<150', '<300', '<500', '<800', '800+', '×'][i]}</span>
                </div>
              );
            })}
          </div>
        </Card>
        <Card className="protos">
          <div className="chart-h"><b>{T.protoMix}</b></div>
          {protoCount.map(([p, c], i) => (
            <div key={p} className="pr">
              <span className={`pn p-${p}`}>{p}</span>
              <span className="pt"><i className={`p-${p}`} style={{ width: `${(c / Math.max(1, nodes.length)) * 100}%`, transitionDelay: `${i * 80}ms` }} /></span>
              <span className="pc mono">{c}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );

  const Settings = (
    <div className="pg settings">
      <div className="pg-head"><div><h1>{T.settings}</h1><p className="pg-sub muted">MahyarVPN v{VERSION}</p></div></div>
      <div className="set-grid">
        <Card className="set">
          <div className="set-t">{I.lock}{T.connection}</div>
          <div className="mode-cards">
            {(['tun', 'proxy'] as Mode[]).map((m) => (
              <button key={m} className={`mcard rp ${mode === m ? 'on' : ''}`} disabled={status !== 'idle'} onClick={() => setMode(m)}>
                <span className="mc-ic">{m === 'tun' ? I.cpu : I.proxy}</span>
                <b>{m === 'tun' ? 'TUN' : 'Proxy'}</b>
                <small>{m === 'tun' ? T.tunHint : T.proxyHint}</small>
                <span className="mc-check">{I.check}</span>
              </button>
            ))}
          </div>
          <div className="opt"><div><b>{T.auto}</b><small>{T.autoHint}</small></div><Switch on={auto} onChange={setAuto} /></div>
          <div className="opt"><div><b>{T.sortPing}</b><small>{T.sortHint}</small></div><Switch on={sortPing} onChange={setSortPing} /></div>
          {!IS_ANDROID && <div className="opt"><div><b>{T.startup}</b><small>{T.startupHint}</small></div><Switch on={startup} onChange={(v) => invoke('set_autostart', { on: v }).then(() => setStartup(v)).catch((e) => fail(errMsg(e)))} /></div>}
          <div className="opt"><div><b>{T.autoConnect}</b><small>{T.autoConnectHint}</small></div><Switch on={autoConnect} onChange={setAutoConnect} /></div>
        </Card>
        <Card className="set">
          <div className="set-t">{I.aether}{T.engine}</div>
          <div className="mode-cards">
            {(['v2', 'aether'] as Engine[]).map((e) => (
              <button key={e} className={`mcard rp ${engine === e ? 'on' : ''}`} disabled={status !== 'idle'} onClick={() => setEngine(e)}>
                <span className="mc-ic">{e === 'v2' ? I.layers : I.aether}</span>
                <b>{e === 'v2' ? T.m1 : T.m2}</b>
                <small>{e === 'v2' ? T.m1Hint : T.m2Hint}</small>
                <span className="mc-check">{I.check}</span>
              </button>
            ))}
          </div>
          <div className={`ae-opts ${engine === 'aether' ? '' : 'dim'}`}>
            <div className="opt col"><div><b>{T.aeProto}</b><small>{T.aeProtoHint}</small></div>
              <div className="seg wide">
                {AE_PROTOS.map(([v, l]) => <button key={v} className={aeProto === v ? 'on' : ''} disabled={status !== 'idle'} onClick={() => setAeProto(v)}>{l}</button>)}
              </div>
            </div>
            <div className="opt col"><div><b>{T.aeScan}</b><small>{T.aeScanHint}</small></div>
              <div className="seg wide">
                {AE_SCANS.map((v) => <button key={v} className={aeScan === v ? 'on' : ''} disabled={status !== 'idle'} onClick={() => setAeScan(v)}>{T.aeScans[v]}</button>)}
              </div>
            </div>
            {aeProto === 'masque' && <div className="opt"><div><b>{T.aeH2}</b><small>{T.aeH2Hint}</small></div><Switch on={aeH2} onChange={setAeH2} disabled={status !== 'idle'} /></div>}
          </div>
        </Card>
        <Card className="set">
          <div className="set-t">{I.palette}{T.appearance}</div>
          <div className="opt col"><b>{T.theme}</b>
            <div className="swatches">
              {(Object.keys(THEMES) as Theme[]).map((th) => (
                <button key={th} className={`swatch rp ${theme === th ? 'on' : ''}`} onClick={() => setTheme(th)} style={{ ['--s1' as any]: THEMES[th][0], ['--s2' as any]: THEMES[th][1] } as CSSProperties}>
                  <i /><span>{T.themes[th]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="opt"><div><b>{T.language}</b></div>
            <div className="mini-seg">
              <button className={lang === 'fa' ? 'on' : ''} onClick={() => setLang('fa')}>فارسی</button>
              <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
              <span className="ms-glow" data-p={lang === 'fa' ? 'tun' : 'proxy'} />
            </div>
          </div>
          <div className="opt"><div><b>{T.reduce}</b><small>{T.reduceHint}</small></div><Switch on={reduce} onChange={setReduce} /></div>
        </Card>
        <Card className="set subs">
          <div className="set-t">{I.sub}{T.subscription}<span className="set-badge mono">{nodes.length}</span></div>
          <div className="src-list">
            {sources.map((x) => (
              <div key={x.id} className={`src-row ${subOff.includes(x.id) ? 'off' : ''}`}>
                <span className={`src-ic ${x.kind}`}>{x.kind === 'own' ? I.lock : I.radar}</span>
                <div className="src-txt"><b dir="auto">{x.name}</b><small>{x.kind === 'own' ? T.srcOwnHint : T.srcPubHint(topN)}</small></div>
                {!x.builtin && <button className="tb sm" onClick={() => { setCustomSubs((c) => c.filter((y) => y.id !== x.id)); setSubOff((o) => o.filter((y) => y !== x.id)); }} data-tip={T.remove}>{I.x}</button>}
                <Switch on={!subOff.includes(x.id)} onChange={(v) => setSubOff((o) => (v ? o.filter((y) => y !== x.id) : [...o, x.id]))} />
              </div>
            ))}
          </div>
          <form className="add-sub" onSubmit={(e) => { e.preventDefault(); addSub(); }}>
            <span className="as-ic">{I.plus}</span>
            <input value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder={T.addSubPh} dir="ltr" spellCheck={false} />
            <button className="btn sm accent rp" type="submit" disabled={!/^https?:\/\/\S+$/.test(newSub.trim())}>{T.add}</button>
          </form>
          <div className="opt"><div><b>{T.topN}</b><small>{T.topNHint}</small></div>
            <div className="seg">
              {[5, 10, 15, 20].map((v) => <button key={v} className={`mono ${topN === v ? 'on' : ''}`} onClick={() => setTopN(v)}>{v}</button>)}
            </div>
          </div>
          <div className="sub-foot">
            <small className="muted">{T.lastUpdate}: {updatedText}{lastScan ? ` · ${T.scanShort(lastScan.pool, lastScan.picked)}` : ''}{manual.length ? ` · ${T.manualCount(manual.length)}` : ''}</small>
            <div className="row2">
              <button className="btn rp" onClick={() => setImportOpen(true)}>{I.paste}{T.importCfg}</button>
              <button className="btn ghost rp" onClick={clearManual} disabled={!manual.length}>{I.x}{T.clearManual}</button>
            </div>
            <div className="row2">
              <button className="btn rp" onClick={refetch} disabled={!!busy || status === 'connecting'}><span className={busy === 'fetch' ? 'spin' : ''}>{I.refresh}</span>{busy === 'fetch' ? T.fetching : T.getConfigs}</button>
              <button className="btn accent rp" onClick={rescan} disabled={!!busy || status === 'connecting'}><span className={busy === 'scan' ? 'spin' : ''}>{I.radar}</span>{busy === 'scan' ? T.scanning : T.rescan}</button>
            </div>
          </div>
        </Card>
        <Card className="set">
          <div className="set-t">{I.keyboard}{T.shortcuts}</div>
          <div className="keys">
            {[[T.kPalette, 'Ctrl+K'], [T.kConnect, 'Ctrl+Enter'], [T.kConfigs, 'F5'], [T.kPing, 'Ctrl+T'], [T.kRescan, 'Ctrl+R'], [T.kImport, 'Ctrl+I'], [T.kSearch, 'Ctrl+F'], [T.kPages, 'Ctrl+1-4'], [T.kFull, 'F11']].map(([a, k]) => (
              <div key={k} className="krow"><span>{a}</span><Kbd k={k} /></div>
            ))}
          </div>
        </Card>
        <Card className="set about">
          <div className="about-logo">{I.logo}</div>
          <div className="about-tx"><b>Mahyar<span className="grad">VPN</span> <span className="ver">v{VERSION}</span></b><small>{T.aboutText}</small></div>
          {hasUpd
            ? <button className="btn accent rp" onClick={openRelease}>{I.download}{T.download} v{upd}</button>
            : <button className="btn rp" onClick={() => checkUpdate()} disabled={upd === 'checking'}><span className={upd === 'checking' ? 'spin' : ''}>{upd === 'checking' ? I.refresh : I.rocket}</span>{upd === 'checking' ? T.checkingUpd : upd === 'latest' ? T.upToDate(VERSION) : T.checkUpd}</button>}
        </Card>
      </div>
    </div>
  );

  const navItems: [Page, ReactNode, string][] = [['home', I.home, T.home], ['servers', I.servers, T.servers], ['stats', I.stats, T.stats], ['settings', I.settings, T.settings]];
  const pIdx = PAGES.indexOf(page);

  return (
    <div className="app" data-status={status} data-reduce={reduce} style={vars}>
      <div className="bg"><span className="aurora a" /><span className="aurora b" /><span className="aurora c" /><span className="noise" /><span className="grid-bg" /></div>

      <header className="titlebar" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region>{I.logo}<span>Mahyar<b className="grad">VPN</b></span></div>
        <button className="cmdk rp" onClick={() => setPal(true)}>{I.search}<span>{T.paletteHint}</span><Kbd k="Ctrl+K" /></button>
        <div className="win">
          <button className="wb" onClick={() => setLang(lang === 'fa' ? 'en' : 'fa')}><span className="wl">{lang === 'fa' ? 'EN' : 'فا'}</span></button>
          {!IS_ANDROID && <>
          <button className="wb" onClick={() => invoke('hide_main').catch(() => win.minimize())} aria-label="minimize" title={T.toTray}>{I.min}</button>
          <button className="wb" onClick={() => win.toggleMaximize()} aria-label="maximize">{maxed ? I.restore : I.max}</button>
          <button className="wb x" onClick={() => invoke('hide_main').catch(() => win.close())} aria-label="close" title={T.toTray}>{I.close}</button>
          </>}
        </div>
      </header>

      <div className="shell">
        <nav className="rail" style={{ ['--i' as any]: pIdx } as CSSProperties}>
          <span className="rail-ind" />
          {navItems.map(([p, ic, l]) => (
            <button key={p} className={`rb ${page === p ? 'on' : ''}`} onClick={() => setPage(p)} data-tip={l}>
              {ic}<span className="rl">{l}</span>
              {p === 'servers' && nodes.length > 0 && <em>{nodes.length}</em>}
            </button>
          ))}
          <span className="rail-sp" />
          <span className={`rail-st`} title={label}><i /></span>
        </nav>
        <main className="content">
          <div className="page" key={page}>{page === 'home' ? Dashboard : page === 'servers' ? Servers : page === 'stats' ? Stats : Settings}</div>
        </main>
      </div>

      <div className="toasts">
        {toasts.map((x) => (
          <div key={x.id} className={`toast ${x.type}`} onClick={() => setToasts((ts) => ts.filter((y) => y.id !== x.id))}>
            <span className="t-ic">{x.type === 'ok' ? I.check : I.alert}</span><span className="t-msg">{x.msg}</span><span className="t-bar" />
          </div>
        ))}
      </div>

      {pal && (
        <div className="overlay" onClick={() => setPal(false)}>
          <div className="palette" onClick={(e) => e.stopPropagation()}>
            <div className="pal-in">{I.command}
              <input ref={palRef} value={palQ} placeholder={T.palette}
                onChange={(e) => { setPalQ(e.target.value); setPalI(0); }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setPalI((i) => Math.min(palItems.length - 1, i + 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setPalI((i) => Math.max(0, i - 1)); }
                  if (e.key === 'Enter') { e.preventDefault(); runPal(palItems[palI]); }
                }} />
              <Kbd k="Esc" />
            </div>
            <div className="pal-list">
              {palItems.map((it, i) => (
                <div key={it.id}>
                  {(i === 0 || palItems[i - 1].group !== it.group) && <div className="pal-g">{it.group}</div>}
                  <button className={`pal-it ${i === palI ? 'on' : ''}`} onMouseEnter={() => setPalI(i)} onClick={() => runPal(it)}>
                    <span className="pal-ic">{it.icon}</span><span className="pal-l" dir="auto">{it.label}</span>{it.hint && <span className="pal-h mono">{it.hint}</span>}
                  </button>
                </div>
              ))}
              {!palItems.length && <div className="empty small">{T.noMatch}</div>}
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="overlay" onClick={() => setImportOpen(false)}>
          <div className="modal import" onClick={(e) => e.stopPropagation()}>
            <div className="m-ic">{I.paste}</div>
            <h3>{T.importTitle}</h3>
            <p>{T.importHint}</p>
            <textarea ref={importRef} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={T.importPh} dir="ltr" spellCheck={false}
              onKeyDown={(e) => { if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); importConfigs(); } }} />
            <div className="row2">
              <button className="btn rp" onClick={pasteClip}>{I.paste}{T.pasteClip}</button>
              <button className="btn accent rp" onClick={importConfigs} disabled={!importText.trim()}>{I.plus}{T.importBtn}</button>
            </div>
            <button className="btn ghost" onClick={() => setImportOpen(false)}>{T.cancel}</button>
          </div>
        </div>
      )}

      {adminAsk && (
        <div className="overlay" onClick={() => setAdminAsk(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="m-ic">{I.shieldOk}</div>
            <h3>{T.adminTitle}</h3>
            <p>{T.adminText}</p>
            <button className="btn accent rp" onClick={() => invoke('relaunch_admin').catch((e) => { setAdminAsk(false); showToast(errMsg(e), 'err'); })}>{T.relaunch}</button>
            <button className="btn rp" onClick={() => { setMode('proxy'); setAdminAsk(false); }}>{T.useProxy}</button>
            <button className="btn ghost" onClick={() => setAdminAsk(false)}>{T.cancel}</button>
          </div>
        </div>
      )}

      {splash && (
        <div className="splash">
          <div className="sp-logo">
            <svg viewBox="0 0 32 32"><ellipse className="sp-orbit" cx="16" cy="16.5" rx="14.5" ry="5.2" transform="rotate(-22 16 16.5)" /><path className="sp-path" d="M16 3l10 3.8v7.6c0 6.6-4.4 11.1-10 13.3-5.6-2.2-10-6.7-10-13.3V6.8z" /><path className="sp-check" d="M11.4 15.4l3.3 3.3 6-6.4" /></svg>
            <span className="sp-ring" />
          </div>
          <div className="sp-name">Mahyar<b className="grad">VPN</b></div>
          <div className="sp-bar"><i /></div>
        </div>
      )}
    </div>
  );
}
