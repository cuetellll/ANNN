// تست‌های کانفیگ: نسخه‌ها یکی باشن و منابع sing-box و Aether توی باندل باشن
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); else console.log(`✓ ${msg}`); };

const pkg = JSON.parse(read('package.json'));
const tauri = JSON.parse(read('src-tauri/tauri.conf.json'));
const cargo = read('src-tauri/Cargo.toml').match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const app = read('src/App.tsx').match(/const VERSION = '([^']+)'/)?.[1];

ok(pkg.version === tauri.version, `package.json (${pkg.version}) == tauri.conf.json (${tauri.version})`);
ok(pkg.version === cargo, `package.json (${pkg.version}) == Cargo.toml (${cargo})`);
ok(pkg.version === app, `package.json (${pkg.version}) == App.tsx VERSION (${app})`);

const res = tauri.bundle?.resources ?? {};
ok(res['bin/sing-box.exe'] === 'sing-box.exe', 'sing-box.exe is bundled');
ok(res['bin/aether/*'] === 'aether/', 'Aether folder is bundled');

const sb = read('src/singbox.ts');
ok(/export function buildAetherConfig/.test(sb), 'buildAetherConfig exists');
ok(/process_name: \['aether\.exe'\]/.test(sb), 'aether.exe bypasses the TUN (no loop)');

const cfg = read('src/config.ts');
ok(/AETHER_PORT = 1819/.test(cfg), 'Aether SOCKS port is 1819');

const rs = read('src-tauri/src/main.rs');
ok(/start_aether,/.test(rs), 'start_aether command is registered');

if (fails.length) {
  console.error(`\n✗ ${fails.length} config test(s) failed:\n- ${fails.join('\n- ')}`);
  process.exit(1);
}
console.log('\nAll config tests passed');
