import { createHash, timingSafeEqual } from 'node:crypto';
import { localeFromRequest, tr } from './i18n.js';

// Uzavřený provoz (ACCESS_KEY): server je na internetu, ale bez klíče z něj nikdo nic nedostane.
//   – API chce hlavičku X-Access-Key (testovací build aplikace ji posílá, EXPO_PUBLIC_ACCESS_KEY),
//   – web se v prohlížeči ptá na heslo (HTTP Basic, jméno libovolné, heslo = klíč),
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

const digest = (s) => createHash('sha256').update(String(s)).digest();

export function accessGate(accessKey) {
  const expected = digest(accessKey);
  const matches = (given) => given != null && timingSafeEqual(digest(given), expected);

  return (req, res, next) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    if (OPEN.some((re) => re.test(req.path))) return next();

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
