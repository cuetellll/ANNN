// ===== تنظیمات ساب‌اسکریپشن =====
// موقع بیلد در GitHub Actions، اسم کاربری گیت‌هابت خودکار جایگزین میشه.
// اگه می‌خوای لینک کاملاً دلخواه بدی، توی Settings > Variables ریپو متغیر SUB_URL بساز.
const env = (import.meta as any).env || {};
const OWNER: string = env.VITE_GH_OWNER || 'YOUR_GITHUB_USERNAME';
const CUSTOM: string = env.VITE_SUB_URL || '';
const HAS_OWNER = OWNER !== 'YOUR_GITHUB_USERNAME';
const REPO: string = env.VITE_GH_REPO || 'mahyarvpn';

/** v2.4: بررسی نسخه‌ی جدید برنامه از ریلیزهای گیت‌هاب */
export const RELEASE_API = HAS_OWNER ? `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest` : '';
export const RELEASE_PAGE = HAS_OWNER ? `https://github.com/${OWNER}/${REPO}/releases/latest` : '';

export const SUB_URLS: string[] = [
  ...(CUSTOM ? [CUSTOM] : []),
  ...(HAS_OWNER
    ? [
        `https://raw.githubusercontent.com/${OWNER}/mahyarvpn-sub/main/sub.txt`,
        `https://cdn.jsdelivr.net/gh/${OWNER}/mahyarvpn-sub@main/sub.txt`,
      ]
    : []),
];

/**
 * منبع کانفیگ:
 *  - own: ساب شخصی خودت، همه‌ی کانفیگ‌هاش میاد
 *  - public: ساب عمومی (هزاران کانفیگ)، فقط سریع‌ترین‌ها با نت کاربر انتخاب میشن
 */
export type SubSource = { id: string; name: string; urls: string[]; kind: 'own' | 'public'; builtin?: boolean };

export const BUILTIN_SOURCES: SubSource[] = [
  ...(SUB_URLS.length ? [{ id: 'own', name: 'MahyarVPN', urls: SUB_URLS, kind: 'own' as const, builtin: true }] : []),
  {
    id: 'anon',
    name: 'انونیموس 𝕏',
    kind: 'public',
    builtin: true,
    urls: [
      'https://raw.githubusercontent.com/4n0nymou3/multi-proxy-config-fetcher/refs/heads/main/configs/proxy_configs.txt',
      // میرور، اگه raw.githubusercontent فیلتر بود
      'https://cdn.jsdelivr.net/gh/4n0nymou3/multi-proxy-config-fetcher@main/configs/proxy_configs.txt',
    ],
  },
];

/** تعداد پیش‌فرض کانفیگ‌هایی که از ساب‌های عمومی نگه داشته میشن */
export const DEFAULT_TOP_N = 10;

export const PROXY_PORT = 12334;
export const API_PORT = 12335;
export const TEST_URL = 'https://www.gstatic.com/generate_204';
export const TEST_TIMEOUT = 5000;

// ===== اسکن هوشمند =====
export const SCAN = {
  maxPool: 2500,        // حداکثر کانفیگی که از ساب عمومی بررسی میشه
  tcpTimeout: 1500,     // ms، مرحله‌ی اول: اتصال TCP خام به سرور
  tcpConcurrency: 128,
  perHost: 3,           // حداکثر چند کانفیگ از یه آدرس سرور بره تو تست واقعی (تنوع)
  realTimeout: 4000,    // ms، مرحله‌ی دوم: درخواست HTTP واقعی از داخل تونل
  realConcurrency: 24,
  realChunk: 48,        // چند سرور توی هر sing-box موقت
  maxReal: 260,         // سقف کل تست واقعی
  udpExtra: 24,         // hy2/tuic با TCP تست نمیشن؛ چندتاشون مستقیم میرن تست واقعی
};

// ===== v2.5 · مدل اتصال ۲ (Aether) =====
/** پورت SOCKS5 محلی Aether (همونی که قبلاً دستی توی V2Ray وارد می‌کردی) */
export const AETHER_PORT = 1819;
export type AetherProto = 'masque' | 'wg' | 'gool';
export type AetherScan = 'turbo' | 'balanced' | 'thorough' | 'ironclad';
