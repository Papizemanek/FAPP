import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { getUser, nextCheckInDue, shareStatus } from '../model.js';
import { HttpError } from '../util.js';

const SHARE_PAGE = readFileSync(new URL('../../public/share.html', import.meta.url), 'utf8');

// Veřejná stránka pro důvěryhodnou osobu. Přístup = znalost náhodného tokenu v odkazu z SMS.
// Ukazuje jen to, co potřebuje v případě problému: stav, polohu, s kým a kde je schůzka.
export function shareRoutes({ db }) {
  const r = Router();
  const load = (t) => {
    const s = db.prepare('SELECT * FROM safety_sessions WHERE share_token = ?').get(String(t));
    if (!s) throw new HttpError(404, 'Odkaz už neplatí.');
    return s;
  };

  const noIndex = (_req, res, next) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Cache-Control', 'no-store');
    next();
  };

  r.get('/s/:token', noIndex, (req, res) => {
    load(req.params.token);
    res.type('html').send(SHARE_PAGE);
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
    if (!s.partner_photo || shareStatus(s) === 'ended') throw new HttpError(404, 'Fotka není k dispozici.');
    res.type('image/jpeg').send(Buffer.from(s.partner_photo));
  });

  // Návrat z ověřovací služby zpět do aplikace.
  r.get('/verification/done', (_req, res) => {
    res.redirect('fapp://verify');
  });

  return r;
}
