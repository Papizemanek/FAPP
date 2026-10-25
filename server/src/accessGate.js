import { createHash, timingSafeEqual } from 'node:crypto';
import { localeFromRequest, tr } from './i18n.js';

// Uzavřený provoz (ACCESS_KEY): server je na internetu, ale bez klíče z něj nikdo nic nedostane.
//   – nativní aplikace posílá hlavičku X-Access-Key (EXPO_PUBLIC_ACCESS_KEY),
//   – webová verze aplikace: tester jednou otevře pozvánku /app/<klíč>, server mu uloží přihlašovací
//     cookie (jen otisk klíče, ne klíč) a dál ho pouští; iPhone ji na ploše otevírá přes manifest,
//   – web se jinak v prohlížeči ptá na heslo (HTTP Basic, jméno libovolné, heslo = klíč),
//   – volné zůstává jen to, co klíč mít nemůže: odkaz pro důvěryhodnou osobu z SMS (/s/…, chráněný
//     vlastním tajným tokenem), návrat z ověření totožnosti, podepsané webhooky a /health pro hosting.
// Bez klíče odpovídá API stejně jako na neexistující adresu, aby nebylo poznat, že tu něco běží.

const OPEN = [
  /^\/health$/,
  /^\/s\/[^/]+$/,
  /^\/api\/share\//,
  /^\/vendor\/leaflet\//,
  /^\/verification\/done$/,
  /^\/api\/verification\/webhook$/,
  /^\/api\/billing\/webhook\//,
];

export const ACCESS_COOKIE = 'yy_access';
const digest = (s) => createHash('sha256').update(String(s)).digest();
const cookieValue = (key) => createHash('sha256').update(`yesyes-access:${key}`).digest('hex');

function readCookie(req, name) {
  for (const part of String(req.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export function accessGate(accessKey) {
  const expected = digest(accessKey);
  const matches = (given) => given != null && timingSafeEqual(digest(given), expected);
  const expectedCookie = digest(cookieValue(accessKey));
  const cookieOk = (req) => {
    const value = readCookie(req, ACCESS_COOKIE);
    return value != null && timingSafeEqual(digest(value), expectedCookie);
  };

  return (req, res, next) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    if (OPEN.some((re) => re.test(req.path))) return next();

    // Pozvánka do webové verze: /app/<klíč> → přihlašovací cookie a přesměrování do aplikace.
    const invite = req.path.match(/^\/app\/([^/]+)\/?$/);
    if (invite && req.method === 'GET') {
      if (!matches(decodeURIComponent(invite[1]))) return res.status(404).type('text').send('404');
      const secure = req.secure || req.get('x-forwarded-proto') === 'https' ? '; Secure' : '';
      res.set('Set-Cookie', `${ACCESS_COOKIE}=${cookieValue(accessKey)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`);
      return res.redirect(302, '/');
    }

    if (cookieOk(req)) return next();

    if (req.path.startsWith('/api/')) {
      if (matches(req.get('x-access-key'))) return next();
      return res.status(404).json({ error: tr(localeFromRequest(req), 'errors.notFound') });
    }

    const [scheme, encoded] = String(req.get('authorization') ?? '').split(' ');
    const password = scheme === 'Basic' && encoded ? Buffer.from(encoded, 'base64').toString('utf8').split(':').slice(1).join(':') : null;
    if (matches(password)) return next();
    res.set('WWW-Authenticate', 'Basic realm="YesYes", charset="UTF-8"');
    res.status(401).type('text').send('401');
  };
}
