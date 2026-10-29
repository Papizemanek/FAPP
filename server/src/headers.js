import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Bezpečnostní hlavičky. Každá HTML stránka dostane Content-Security-Policy, která povolí jen skripty
// z našeho serveru a vložené skripty s přesně tímhle obsahem (SHA-256) – podstrčený skript (XSS) se nespustí.

const MAP_TILES = 'https://tile.openstreetmap.org';

const inlineScriptHashes = (html) =>
  [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/gi)].map(
    (m) => `'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`,
  );

export function cspForHtml(html, { secure = false } = {}) {
  const hashes = [...new Set(inlineScriptHashes(html))];
  return [
    "default-src 'none'",
    `script-src 'self' ${hashes.join(' ')}`.trim(),
    // React Native Web vkládá styly za běhu; styly samy o sobě kód nespustí.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${MAP_TILES}`,
    "font-src 'self' data:",
    "connect-src 'self'",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    ...(secure ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

// Stránky se posílají pořád stejné (webová aplikace má 4 MB) – hledání skriptů proběhne jednou.
const cspCache = new Map();
function cachedCsp(html, secure) {
  const key = `${secure ? 1 : 0}:${createHash('sha256').update(html).digest('base64')}`;
  let csp = cspCache.get(key);
  if (!csp) {
    if (cspCache.size > 200) cspCache.clear();
    csp = cspForHtml(html, { secure });
    cspCache.set(key, csp);
  }
  return csp;
}

const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";

export function securityHeaders() {
  return (req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Cross-Origin-Opener-Policy', 'same-origin');
    res.set('Cross-Origin-Resource-Policy', 'same-origin');
    res.set('Permissions-Policy', 'geolocation=(self), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()');
    // HSTS podle skutečného spojení (za proxy přes TRUST_PROXY), ne podle NODE_ENV.
    if (req.secure) res.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
    res.set('Content-Security-Policy', API_CSP);

    // HTML odpovědi (res.send s řetězcem) dostanou CSP s otisky svých vložených skriptů.
    const send = res.send.bind(res);
    res.send = (body) => {
      if (typeof body === 'string' && /html/.test(String(res.get('Content-Type') ?? ''))) {
        res.set('Content-Security-Policy', cachedCsp(body, req.secure));
      }
      return send(body);
    };
    next();
  };
}

const fileCsp = new Map();
/** Pro express.static: CSP podle obsahu HTML souboru (spočítá se jednou). */
export function staticCsp(res, filePath) {
  if (!filePath.endsWith('.html')) return;
  if (!fileCsp.has(filePath)) fileCsp.set(filePath, cspForHtml(readFileSync(filePath, 'utf8'), { secure: true }));
  res.set('Content-Security-Policy', fileCsp.get(filePath));
}

export const SECURITY_TXT = (publicUrl) => `Contact: mailto:security@yesyesapp.com
Expires: ${new Date(Date.now() + 365 * 86400_000).toISOString().slice(0, 10)}T00:00:00.000Z
Preferred-Languages: cs, en
Canonical: ${publicUrl}/.well-known/security.txt
`;
