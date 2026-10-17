import { Router } from 'express';
import { CHECK_IN_OPTIONS, WRONG_PIN_ALARM_THRESHOLD } from '../../../shared/constants.js';
import {
  activeSafetySession,
  addFlag,
  agreementStatus,
  checkPattern,
  currentAgreement,
  getMatchFor,
  getUser,
  isOverdue,
  nextCheckInDue,
  ownSafetyView,
} from '../model.js';
import { DEFAULT_LOCALE, msg, tr } from '../i18n.js';
import { smsText } from '../services/alerts.js';
import { notify } from '../services/push.js';
import { HttpError, ageFrom, int, nowIso, num, parseJson, token, verifySecret } from '../util.js';
import { requireAuth, requireVerified } from './auth.js';

// Bezpečnostní režim. Všechno, co znamená „jsem v pořádku“ (check-in, zrušení SOS, ukončení),
// vyžaduje PIN. Nouzový PIN se navenek chová úplně stejně jako běžný, ale potichu spustí poplach.
// Odpověď serveru se v obou případech neliší, aby ji nešlo rozpoznat ani na obrazovce.

export function safetyRoutes({ db, config, alerts }) {
  const r = Router();
  const shareUrl = (s) => `${config.publicUrl}/s/${s.share_token}`;
  const load = (id) => db.prepare('SELECT * FROM safety_sessions WHERE id = ?').get(Number(id));
  // Jméno a jazyk pro SMS důvěryhodné osobě. Jazyk se zafixuje při startu schůzky,
  // starší schůzky (bez uloženého jazyka) používají aktuální jazyk uživatele.
  const smsFor = (s) => {
    const user = getUser(db, s.user_id);
    const locale = s.locale ?? user?.locale ?? DEFAULT_LOCALE;
    return { locale, name: user?.name ?? tr(locale, 'sms.someone') };
  };

  const view = (s) => ({
    ...ownSafetyView(s, config.publicUrl),
    matchId: s.match_id,
    meetAt: s.meet_at,
    place: s.place,
    partner: { name: s.partner_name, age: s.partner_age },
  });

  const loadOwn = (req) => {
    const s = load(req.params.id);
    if (!s || s.user_id !== req.user.id) throw new HttpError(404, 'safety.notFound');
    return s;
  };
  const loadActive = (req) => {
    const s = loadOwn(req);
    if (s.ended_at) throw new HttpError(409, 'safety.ended');
    return s;
  };

  function raiseSilentAlarm(sessionId, reason) {
    const s = load(sessionId);
    if (s.silent_alarm_at || s.sos_at) return;
    db.prepare('UPDATE safety_sessions SET silent_alarm_at = ?, silent_alarm_reason = ? WHERE id = ?').run(
      nowIso(),
      reason,
      s.id,
    );
    const { locale, name } = smsFor(s);
    alerts.enqueue(s, smsText.alarm(locale, name, shareUrl(s)));
    flagPartner(s, reason, 'high');
  }

  /** Poplach během schůzky je signál o protějšku pro moderátory. Protějšek o tom nic neví. */
  function flagPartner(s, reason, priority) {
    if (!s.partner_id) return;
    addFlag(db, { userId: s.partner_id, byUserId: s.user_id, source: 'safety', reason, priority, refId: s.id });
    checkPattern(db, s.partner_id);
  }

  /** 'ok' | 'duress' | 'wrong'. Opakovaně špatný PIN spustí tichý poplach. */
  function checkPin(req, s) {
    const pin = String(req.body?.pin ?? '');
    if (verifySecret(pin, req.user.duress_pin_hash)) return 'duress';
    if (verifySecret(pin, req.user.checkin_pin_hash)) return 'ok';
    const wrong = s.wrong_pin_count + 1;
    db.prepare('UPDATE safety_sessions SET wrong_pin_count = ? WHERE id = ?').run(wrong, s.id);
    if (wrong >= WRONG_PIN_ALARM_THRESHOLD) raiseSilentAlarm(s.id, 'wrong_pin');
    return 'wrong';
  }

  const wrongPin = () => new HttpError(403, 'safety.wrongPin');

  // --- start ---

  r.post('/matches/:id/safety', requireAuth(db), requireVerified, (req, res) => {
    const { match, other } = getMatchFor(db, req.params.id, req.user.id);
    const agreement = currentAgreement(db, match.id);
    if (!agreement || agreementStatus(db, agreement, match) !== 'confirmed') {
      throw new HttpError(409, 'safety.agreementRequired');
    }
    if (!req.user.trusted_phone || !req.user.checkin_pin_hash || !req.user.duress_pin_hash) {
      throw new HttpError(409, 'safety.setupRequired');
    }
    const minutes = int(req.body?.checkInMinutes ?? 30, 'fields.checkInMinutes', { min: 1, max: 600 });
    if (!CHECK_IN_OPTIONS.includes(minutes)) throw new HttpError(400, 'safety.invalidInterval');

    const existing = activeSafetySession(db, req.user.id, match.id);
    if (existing) return res.json(view(existing));

    const photoId = parseJson(other.photos, [])[0];
    const photo = photoId ? db.prepare('SELECT data FROM images WHERE id = ?').get(photoId)?.data : null;
    const now = nowIso();
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO safety_sessions (user_id, match_id, agreement_id, partner_id, partner_name, partner_age, partner_photo,
           meet_at, place, share_token, trusted_name, trusted_phone, check_in_minutes, started_at, last_check_in_at, locale)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        req.user.id,
        match.id,
        agreement.id,
        other.id,
        other.name,
        ageFrom(other.birthdate),
        photo ?? null,
        agreement.meet_at,
        agreement.place,
        token(24),
        req.user.trusted_name,
        req.user.trusted_phone,
        minutes,
        now,
        now,
        req.user.locale ?? DEFAULT_LOCALE,
      );
    const s = load(lastInsertRowid);
    alerts.enqueue(s, smsText.started(smsFor(s).locale, req.user.name, shareUrl(s)));
    res.status(201).json(view(s));
  });

  // --- průběh (funguje i pro pozastavený účet – bezpečí má přednost) ---

  const auth = requireAuth(db, { allowSuspended: true });

  r.get('/safety/active', auth, (req, res) => {
    const rows = db
      .prepare('SELECT * FROM safety_sessions WHERE user_id = ? AND ended_at IS NULL ORDER BY id DESC')
      .all(req.user.id);
    res.json(rows.map(view));
  });

  r.get('/safety/:id', auth, (req, res) => res.json(view(loadOwn(req))));

  r.post('/safety/:id/location', auth, (req, res) => {
    const s = loadActive(req);
    const b = req.body ?? {};
    db.prepare('UPDATE safety_sessions SET lat = ?, lng = ?, accuracy = ?, battery = ?, location_at = ? WHERE id = ?').run(
      num(b.lat, 'fields.lat', { min: -90, max: 90 }),
      num(b.lng, 'fields.lng', { min: -180, max: 180 }),
      b.accuracy == null ? null : num(b.accuracy, 'fields.accuracy', { min: 0, max: 100000 }),
      b.battery == null ? null : num(b.battery, 'fields.battery', { min: 0, max: 1 }),
      nowIso(),
      s.id,
    );
    res.status(204).end();
  });

  r.post('/safety/:id/checkin', auth, (req, res) => {
    const s = loadActive(req);
    const result = checkPin(req, s);
    if (result === 'wrong') throw wrongPin();
    db.prepare(
      'UPDATE safety_sessions SET last_check_in_at = ?, overdue_alerted_at = NULL, wrong_pin_count = 0 WHERE id = ?',
    ).run(nowIso(), s.id);
    if (result === 'duress') raiseSilentAlarm(s.id, 'duress');
    else if (s.overdue_alerted_at && !s.silent_alarm_at && !s.sos_at) alerts.enqueue(s, smsText.backOk(smsFor(s).locale, req.user.name));
    res.json(view(load(s.id)));
  });

  r.post('/safety/:id/sos', auth, (req, res) => {
    const s = loadActive(req);
    if (!s.sos_at) {
      db.prepare('UPDATE safety_sessions SET sos_at = ? WHERE id = ?').run(nowIso(), s.id);
      if (!s.silent_alarm_at) {
        alerts.enqueue(s, smsText.alarm(smsFor(s).locale, req.user.name, shareUrl(s)));
        flagPartner(s, 'sos', 'high');
      }
    }
    res.json(view(load(s.id)));
  });

  r.post('/safety/:id/sos/cancel', auth, (req, res) => {
    const s = loadActive(req);
    const result = checkPin(req, s);
    if (result === 'wrong') throw wrongPin();
    if (!s.sos_at) return res.json(view(load(s.id)));
    if (result === 'duress') {
      // Na telefonu poplach zmizí, ale důvěryhodná osoba ho dál vidí.
      db.prepare(
        "UPDATE safety_sessions SET sos_at = NULL, silent_alarm_at = COALESCE(silent_alarm_at, ?), silent_alarm_reason = 'duress' WHERE id = ?",
      ).run(nowIso(), s.id);
    } else {
      // SOS zrušené běžným PINem jako omyl – příznak o protějšku zůstává, ale moderátor uvidí kontext.
      db.prepare('UPDATE safety_sessions SET sos_at = NULL, last_check_in_at = ?, wrong_pin_count = 0 WHERE id = ?').run(
        nowIso(),
        s.id,
      );
      if (!s.silent_alarm_at) alerts.enqueue(s, smsText.sosCancelled(smsFor(s).locale, req.user.name));
    }
    res.json(view(load(s.id)));
  });

  r.post('/safety/:id/end', auth, (req, res) => {
    const s = loadActive(req);
    const result = checkPin(req, s);
    if (result === 'wrong') throw wrongPin();
    const now = nowIso();
    if (result === 'duress') {
      // Telefon ukáže „ukončeno“, ale poslední poloha zůstane důvěryhodné osobě k dispozici.
      db.prepare(
        `UPDATE safety_sessions SET ended_at = ?, end_kind = 'duress',
           silent_alarm_reason = CASE WHEN silent_alarm_at IS NULL THEN 'duress' ELSE silent_alarm_reason END,
           silent_alarm_at = COALESCE(silent_alarm_at, ?) WHERE id = ?`,
      ).run(now, now, s.id);
      if (!s.silent_alarm_at && !s.sos_at) {
        alerts.enqueue(s, smsText.alarm(smsFor(s).locale, req.user.name, shareUrl(s)));
        flagPartner(s, 'duress', 'high');
      }
    } else {
      db.prepare(
        `UPDATE safety_sessions SET ended_at = ?, end_kind = 'ok',
           lat = NULL, lng = NULL, accuracy = NULL, battery = NULL, location_at = NULL WHERE id = ?`,
      ).run(now, s.id);
      alerts.enqueue(s, smsText.endedOk(smsFor(s).locale, req.user.name));
    }
    res.json(view(load(s.id)));
  });

  return r;
}

/** Hlídač běží na serveru: když telefon zmlkne (vybitý, vzatý), upozorní důvěryhodnou osobu sám. */
export function checkOverdue({ db, config, services, alerts }, now = Date.now()) {
  const flagPartner = (s) => {
    if (!s.partner_id) return;
    // Zmeškaný check-in bývá zapomnění – nízká priorita, k vzorcům se počítá jen s dalšími signály.
    addFlag(db, { userId: s.partner_id, byUserId: s.user_id, source: 'safety', reason: 'overdue', priority: 'low', refId: s.id });
    checkPattern(db, s.partner_id);
  };
  const candidates = db
    .prepare('SELECT * FROM safety_sessions WHERE ended_at IS NULL AND overdue_alerted_at IS NULL')
    .all();
  for (const s of candidates) {
    if (!isOverdue(s, now)) continue;
    db.prepare('UPDATE safety_sessions SET overdue_alerted_at = ? WHERE id = ?').run(new Date(now).toISOString(), s.id);
    if (s.sos_at || s.silent_alarm_at) continue; // poplach už běží
    flagPartner(s);
    const user = getUser(db, s.user_id);
    const locale = s.locale ?? user?.locale ?? DEFAULT_LOCALE;
    const name = user?.name ?? tr(locale, 'sms.someone');
    const due = new Date(nextCheckInDue(s)).toISOString();
    alerts.enqueue(s, smsText.overdue(locale, name, due, `${config.publicUrl}/s/${s.share_token}`));
    notify(db, services.push, s.user_id, {
      title: msg('push.checkInOverdue.title'),
      body: msg('push.checkInOverdue.body', { name: s.trusted_name }),
      data: { type: 'safety', safetyId: s.id },
    });
  }
}
