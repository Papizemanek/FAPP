import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { DEFAULT_LOCALE, headerLocale, isRTL, matchLocale, namespace, normalizeLocale, tr } from '../i18n.js';
import { getUser, nextCheckInDue, shareStatus } from '../model.js';
import { HttpError } from '../util.js';

const SHARE_PAGE = readFileSync(new URL('../../public/share.html', import.meta.url), 'utf8');

// Tísňové číslo na stránce. 112 funguje v celé EU a z mobilu většinou i jinde.
const EMERGENCY_NUMBER = '112';

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Texty stránky pro důvěryhodnou osobu (jmenný prostor „share“, už spojený se zálohou). */
export function shareBundle(locale) {
  const code = normalizeLocale(locale);
  return { locale: code, dir: isRTL(code) ? 'rtl' : 'ltr', emergency: EMERGENCY_NUMBER, messages: namespace(code, 'share') };
}

const pages = new Map();
/**
 * Stránka s vloženými texty – funguje i bez dalšího požadavku na slovník. explicit = jazyk určil ?lang=
 * nebo prohlížeč (Accept-Language); jinak ho stránka ještě upřesní podle navigator.languages.
 */
function renderPage(locale, explicit) {
  const cacheKey = `${locale}|${explicit}`;
  if (pages.has(cacheKey)) return pages.get(cacheKey);
  const bundle = { ...shareBundle(locale), explicit };
  const json = JSON.stringify(bundle).replace(/</g, '\\u003c');
  const html = SHARE_PAGE.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    escapeHtml(tr(bundle.locale, `share.${key}`, { number: EMERGENCY_NUMBER })),
  )
    .replace(/__LANG__/g, () => bundle.locale)
    .replace(/__DIR__/g, () => bundle.dir)
    .replace('__I18N__', () => json);
  pages.set(cacheKey, html);
  return html;
}

// Veřejná stránka pro důvěryhodnou osobu. Přístup = znalost náhodného tokenu v odkazu z SMS.
// Ukazuje jen to, co potřebuje v případě problému: stav, polohu, s kým a kde je schůzka.
export function shareRoutes({ db }) {
  const r = Router();
  const load = (t) => {
    const s = db.prepare('SELECT * FROM safety_sessions WHERE share_token = ?').get(String(t));
    if (!s) throw new HttpError(404, 'errors.linkExpired');
    return s;
  };

  const noIndex = (_req, res, next) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Cache-Control', 'no-store');
    next();
  };

  // Jazyk stránky: ?lang= → jazyk prohlížeče → jazyk SMS (uživatele) → čeština.
  r.get('/s/:token', noIndex, (req, res) => {
    const s = load(req.params.token);
    const lang = typeof req.query.lang === 'string' ? req.query.lang.trim() : '';
    const fromRequest = lang ? matchLocale([lang]) : headerLocale(req);
    const locale = fromRequest ?? s.locale ?? getUser(db, s.user_id)?.locale ?? DEFAULT_LOCALE;
    res.type('html').send(renderPage(normalizeLocale(locale), !!fromRequest));
  });

  // Slovník stránky pro jiný jazyk: /api/share/i18n/en, nebo seznam podle priority „de-AT,en“.
  r.get('/api/share/i18n/:locale', (req, res) => {
    const tags = String(req.params.locale).split(',').map((x) => x.trim()).filter(Boolean).slice(0, 20);
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(shareBundle(matchLocale(tags)));
  });

  r.get('/api/share/:token', noIndex, (req, res) => {
    const s = load(req.params.token);
    const status = shareStatus(s);
    const name = getUser(db, s.user_id)?.name ?? '';
    const alarmAt = s.sos_at ?? s.silent_alarm_at;
    if (status === 'ended') {
      return res.json({ status, name, endedAt: s.ended_at, hadAlarm: !!alarmAt });
    }
    res.json({
      status,
      name,
      startedAt: s.started_at,
      lastCheckInAt: s.last_check_in_at,
      nextCheckInDue: new Date(nextCheckInDue(s)).toISOString(),
      alarmAt,
      meetAt: s.meet_at,
      place: s.place,
      partner: { name: s.partner_name, age: s.partner_age, hasPhoto: !!s.partner_photo },
      location:
        s.lat != null ? { lat: s.lat, lng: s.lng, accuracy: s.accuracy, battery: s.battery, at: s.location_at } : null,
    });
  });

  // Fotka protějšku – pro případ, že by ho bylo potřeba identifikovat.
  r.get('/api/share/:token/partner-photo', noIndex, (req, res) => {
    const s = load(req.params.token);
    if (!s.partner_photo || shareStatus(s) === 'ended') throw new HttpError(404, 'photo.unavailable');
    res.type('image/jpeg').send(Buffer.from(s.partner_photo));
  });

  // Návrat z ověřovací služby zpět do aplikace.
  r.get('/verification/done', (_req, res) => {
    res.redirect('fapp://verify');
  });

  return r;
}
