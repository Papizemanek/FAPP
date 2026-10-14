import { Router } from 'express';
import { GENDERS, MIN_AGE } from '../../../shared/constants.js';
import { getUser, ownProfile } from '../model.js';
import {
  HttpError,
  ageFrom,
  bool,
  date,
  email,
  hashSecret,
  listOf,
  nowIso,
  oneOf,
  str,
  token,
  verifySecret,
} from '../util.js';

const bearer = (req) => (req.get('authorization') ?? '').replace(/^Bearer /, '');

export function authRoutes({ db, limiter }) {
  const r = Router();

  const createSession = (userId) => {
    const t = token(32);
    db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(t, userId, nowIso());
    return t;
  };

  r.post('/register', limiter('register', 5), (req, res) => {
    const b = req.body ?? {};
    const mail = email(b.email);
    const password = str(b.password, 'heslo', { min: 10, max: 200 });
    const name = str(b.name, 'jméno', { min: 2, max: 40 });
    const birthdate = date(b.birthdate, 'datum narození');
    const gender = oneOf(b.gender, 'pohlaví', GENDERS);
    const interestedIn = listOf(b.interestedIn, 'koho hledáš', GENDERS, { min: 1 });

    if (!bool(b.confirmAdult)) throw new HttpError(400, 'Musíš potvrdit, že je ti 18 let nebo víc.');
    if (!bool(b.acceptRules)) throw new HttpError(400, 'Musíš souhlasit s pravidly a se zpracováním údajů.');
    const age = ageFrom(birthdate);
    if (age < MIN_AGE) throw new HttpError(403, 'F*app je jen pro lidi starší 18 let.');
    if (age > 110) throw new HttpError(400, 'Neplatné datum narození.');

    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(mail)) {
      throw new HttpError(409, 'Účet s tímhle e-mailem už existuje.');
    }
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO users (email, password_hash, name, birthdate, gender, interested_in, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(mail, hashSecret(password), name, birthdate, gender, JSON.stringify(interestedIn), nowIso());
    const id = Number(lastInsertRowid);
    res.status(201).json({ token: createSession(id), user: ownProfile(getUser(db, id)) });
  });

  r.post('/login', limiter('login', 10), (req, res) => {
    const b = req.body ?? {};
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(b.email ?? '').trim().toLowerCase());
    if (!user || !verifySecret(b.password, user.password_hash)) throw new HttpError(401, 'Špatný e-mail nebo heslo.');
    if (user.status === 'banned') throw new HttpError(403, 'Účet byl zablokován za porušení pravidel.');
    res.json({ token: createSession(user.id), user: ownProfile(user) });
  });

  r.post('/logout', (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(bearer(req));
    res.status(204).end();
  });

  // Expo push token tohoto zařízení.
  r.put('/push-token', requireAuth(db, { allowSuspended: true }), (req, res) => {
    const pushToken = str(req.body?.pushToken, 'push token', { max: 200, optional: true }) || null;
    db.prepare('UPDATE sessions SET push_token = ? WHERE token = ?').run(pushToken, bearer(req));
    res.status(204).end();
  });

  return r;
}

/**
 * Přihlášený uživatel. Pozastavený účet smí jen to, co je nutné pro jeho vlastní bezpečí
 * (rozběhnutý bezpečnostní režim, profil, smazání účtu) – proto allowSuspended.
 */
export function requireAuth(db, { allowSuspended = false } = {}) {
  return (req, _res, next) => {
    const t = bearer(req);
    const row = t && db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(t);
    const user = row && getUser(db, row.user_id);
    if (!user) throw new HttpError(401, 'Nejsi přihlášený/á.');
    if (user.status === 'banned') throw new HttpError(403, 'Účet byl zablokován za porušení pravidel.');
    if (user.status === 'suspended' && !allowSuspended) {
      throw new HttpError(403, 'Účet je pozastavený do kontroly moderátorem.');
    }
    req.user = user;
    next();
  };
}

/** Seznamování je jen pro lidi s ověřenou totožností a věkem. */
export function requireVerified(req, _res, next) {
  if (req.user.verification_status !== 'approved') {
    throw new HttpError(403, 'Nejdřív si ověř totožnost.');
  }
  next();
}
