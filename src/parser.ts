export type VNode = {
  id: string;
  link: string;
  name: string;
  protocol: string;
  server: string;
  port: number;
  outbound: Record<string, any>;
};

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function b64decode(input: string): string {
  let s = input.trim().replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const dec = (s: string) => {
  try { return decodeURIComponent(s); } catch { return s; }
};

const isIP = (h: string) => /^[\d.]+$/.test(h) || h.includes(':');

/** متن ساب (base64 یا ساده) را به لیست لینک تبدیل می‌کند */
export function decodeSubscription(text: string): string[] {
  let t = text.trim().replace(/^\uFEFF/, '');
  if (!t.includes('://')) {
    try { t = b64decode(t); } catch { /* not base64 */ }
  }
  return t
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('//') && l.includes('://'));
}

function transport(net?: string, host?: string, path?: string, service?: string, headerType?: string) {
  const n = (net || 'tcp').toLowerCase();
  const hosts = host ? host.split(',').map((x) => x.trim()).filter(Boolean) : undefined;
  switch (n) {
    case 'tcp':
    case 'raw':
    case '':
      if (headerType === 'http') return { type: 'http', method: 'GET', host: hosts, path: path || '/' };
      return undefined;
    case 'ws': {
      let p = path || '/';
      const t: Record<string, any> = { type: 'ws' };
      const m = p.match(/[?&]ed=(\d+)/);
      if (m) {
        t.max_early_data = Number(m[1]);
        t.early_data_header_name = 'Sec-WebSocket-Protocol';
        p = p.replace(/[?&]ed=\d+/, '') || '/';
      }
      t.path = p;
      if (hosts?.length) t.headers = { Host: hosts[0] };
      return t;
    }
    case 'grpc':
      return { type: 'grpc', service_name: service || path || '' };
    case 'h2':
    case 'http':
      return { type: 'http', host: hosts, path: path || '/' };
    case 'httpupgrade':
      return { type: 'httpupgrade', host: hosts?.[0], path: path || '/' };
    default:
      throw new Error(`transport "${n}" is not supported by sing-box`);
  }
}

function tls(o: {
  security?: string; sni?: string; fp?: string; alpn?: string; insecure?: boolean;
  pbk?: string; sid?: string; server: string;
}) {
  const sec = (o.security || '').toLowerCase();
  if (sec !== 'tls' && sec !== 'reality' && sec !== 'xtls') return undefined;
  const t: Record<string, any> = { enabled: true };
  const sni = o.sni || (isIP(o.server) ? '' : o.server);
  if (sni) t.server_name = sni;
  if (o.insecure) t.insecure = true;
  if (o.alpn) t.alpn = o.alpn.split(',').map((x) => x.trim()).filter(Boolean);
  if (o.fp || sec === 'reality') t.utls = { enabled: true, fingerprint: o.fp || 'chrome' };
  if (sec === 'reality') {
    if (!o.pbk) throw new Error('reality without public key');
    t.reality = { enabled: true, public_key: o.pbk, short_id: o.sid || '' };
  }
  return t;
}

function hostPort(hp: string): [string, number] {
  hp = hp.replace(/\/+$/, '');
  const m = hp.match(/^\[(.+)\]:(\d+)$/) || hp.match(/^(.+):(\d+)$/);
  if (!m) throw new Error('bad host:port');
  return [m[1], Number(m[2])];
}

function urlParts(link: string) {
  const u = new URL(link);
  const q: Record<string, string> = {};
  u.searchParams.forEach((v, k) => (q[k] = v));
  const server = u.hostname.replace(/^\[|\]$/g, '');
  const port = Number(u.port);
  return { u, q, server, port, name: dec(u.hash.replace(/^#/, '')), user: dec(u.username), pass: dec(u.password) };
}

const truthy = (v?: string) => v === '1' || v === 'true';

function parseVmess(link: string): Omit<VNode, 'id' | 'link'> {
  const j = JSON.parse(b64decode(link.slice(8)));
  const server = String(j.add || '');
  const port = Number(j.port);
  return {
    name: j.ps || `${server}:${port}`,
    protocol: 'vmess', server, port,
    outbound: {
      type: 'vmess', server, server_port: port, uuid: j.id,
      security: j.scy || 'auto', alter_id: Number(j.aid || 0),
      tls: tls({ security: j.tls, sni: j.sni || j.host, fp: j.fp, alpn: j.alpn, insecure: truthy(String(j.allowInsecure ?? '')), server }),
      transport: transport(j.net, j.host, j.path, j.path, j.type),
    },
  };
}

function parseVless(link: string): Omit<VNode, 'id' | 'link'> {
  const { q, server, port, name, user } = urlParts(link);
  const net = q.type || 'tcp';
  return {
    name: name || `${server}:${port}`, protocol: 'vless', server, port,
    outbound: {
      type: 'vless', server, server_port: port, uuid: user,
      flow: q.flow?.startsWith('xtls-rprx-vision') ? 'xtls-rprx-vision' : undefined, packet_encoding: 'xudp',
      tls: tls({ security: q.security, sni: q.sni || q.host, fp: q.fp, alpn: q.alpn, insecure: truthy(q.allowInsecure || q.insecure), pbk: q.pbk, sid: q.sid, server }),
      transport: transport(net, q.host, q.path, q.serviceName, q.headerType),
    },
  };
}

function parseTrojan(link: string): Omit<VNode, 'id' | 'link'> {
  const { q, server, port, name, user } = urlParts(link);
  return {
    name: name || `${server}:${port}`, protocol: 'trojan', server, port,
    outbound: {
      type: 'trojan', server, server_port: port, password: user,
      tls: tls({ security: q.security || 'tls', sni: q.sni || q.peer || q.host, fp: q.fp, alpn: q.alpn, insecure: truthy(q.allowInsecure || q.insecure), pbk: q.pbk, sid: q.sid, server }),
      transport: transport(q.type, q.host, q.path, q.serviceName, q.headerType),
    },
  };
}

function parseSS(link: string): Omit<VNode, 'id' | 'link'> {
  let body = link.slice(5);
  let name = '';
  const h = body.indexOf('#');
  if (h >= 0) { name = dec(body.slice(h + 1)); body = body.slice(0, h); }
  const qi = body.indexOf('?');
  if (qi >= 0) body = body.slice(0, qi);
  let userinfo: string, hp: string;
  if (body.includes('@')) {
    const at = body.lastIndexOf('@');
    userinfo = dec(body.slice(0, at));
    hp = body.slice(at + 1);
    if (!userinfo.includes(':')) userinfo = b64decode(userinfo);
  } else {
    const d = b64decode(body);
    const at = d.lastIndexOf('@');
    userinfo = d.slice(0, at);
    hp = d.slice(at + 1);
  }
  const ci = userinfo.indexOf(':');
  const [server, port] = hostPort(hp);
  return {
    name: name || `${server}:${port}`, protocol: 'ss', server, port,
    outbound: { type: 'shadowsocks', server, server_port: port, method: userinfo.slice(0, ci), password: userinfo.slice(ci + 1) },
  };
}

function parseHy2(link: string): Omit<VNode, 'id' | 'link'> {
  const { q, server, port, name, user, pass } = urlParts(link.replace(/^hy2:\/\//, 'hysteria2://'));
  const o: Record<string, any> = {
    type: 'hysteria2', server, server_port: port || 443,
    password: pass ? `${user}:${pass}` : user,
    tls: { enabled: true, server_name: q.sni || (isIP(server) ? undefined : server), insecure: truthy(q.insecure) || undefined, alpn: q.alpn ? q.alpn.split(',') : undefined },
  };
  if (q.obfs) o.obfs = { type: q.obfs, password: q['obfs-password'] || '' };
  return { name: name || `${server}:${port}`, protocol: 'hy2', server, port: port || 443, outbound: o };
}

function parseTuic(link: string): Omit<VNode, 'id' | 'link'> {
  const { q, server, port, name, user, pass } = urlParts(link);
  return {
    name: name || `${server}:${port}`, protocol: 'tuic', server, port,
    outbound: {
      type: 'tuic', server, server_port: port, uuid: user, password: pass,
      congestion_control: q.congestion_control || 'bbr',
      udp_relay_mode: q.udp_relay_mode || undefined,
      tls: { enabled: true, server_name: q.sni || (isIP(server) ? undefined : server), insecure: truthy(q.allow_insecure || q.insecure) || undefined, alpn: (q.alpn || 'h3').split(',') },
    },
  };
}

export function parseLink(link: string): VNode {
  const scheme = link.slice(0, link.indexOf('://')).toLowerCase();
  let r: Omit<VNode, 'id' | 'link'>;
  switch (scheme) {
    case 'vmess': r = parseVmess(link); break;
    case 'vless': r = parseVless(link); break;
    case 'trojan': r = parseTrojan(link); break;
    case 'ss': r = parseSS(link); break;
    case 'hysteria2': case 'hy2': r = parseHy2(link); break;
    case 'tuic': r = parseTuic(link); break;
    default: throw new Error(`unsupported: ${scheme}`);
  }
  if (!r.server || !r.port || Number.isNaN(r.port)) throw new Error('missing server/port');
  return { ...r, id: hash(link), link };
}

export function parseLinks(links: string[]) {
  const nodes: VNode[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const l of links) {
    try {
      const n = parseLink(l);
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      nodes.push(n);
    } catch { skipped++; }
  }
  return { nodes, skipped };
}
