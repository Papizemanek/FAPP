import { Router } from 'express';
import { GENDERS, MIN_AGE } from '../../../shared/constants.js';
import { ownProfile, getUser } from '../model.js';
import {
  HttpError,
  ageFrom,
  bool,
  date,
  email,
  hashPassword,
  listOf,
  nowIso,
  oneOf,
  str,
  token,
  verifyPassword,
} from '../util.js';

export function authRoutes(db) {
  const r = Router();

  const createSession = (userId) => {
    const t = token();
    db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(t, userId, nowIso());
    return t;
  };

  r.post('/register', (req, res) => {
    const b = req.body ?? {};
    const mail = email(b.email);
    const password = str(b.password, 'heslo', { min: 8, max: 200 });
    const name = str(b.name, 'jméno', { min: 2, max: 40 });
    const birthdate = date(b.birthdate, 'datum narození');
    const gender = oneOf(b.gender, 'pohlaví', GENDERS);
    const interestedIn = listOf(b.interestedIn, 'koho hledáš', GENDERS, { min: 1 });

    if (!bool(b.confirmAdult)) throw new HttpError(400, 'Musíš potvrdit, že je ti 18 let nebo víc.');
    if (!bool(b.acceptRules)) throw new HttpError(400, 'Musíš souhlasit s pravidly komunity.');
    const age = ageFrom(birthdate);
    if (age < MIN_AGE) throw new HttpError(403, 'F*app je jen pro lidi starší 18 let.');
    if (age > 120) throw new HttpError(400, 'Neplatné datum narození.');

    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(mail)) {
      throw new HttpError(409, 'Účet s tímhle e-mailem už existuje.');
    }

    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO users (email, password_hash, name, birthdate, gender, interested_in, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(mail, hashPassword(password), name, birthdate, gender, JSON.stringify(interestedIn), nowIso());

    const id = Number(lastInsertRowid);
    res.status(201).json({ token: createSession(id), user: ownProfile(getUser(db, id)) });
  });

  r.post('/login', (req, res) => {
    const b = req.body ?? {};
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(b.email ?? '').trim().toLowerCase());
    if (!user || typeof b.password !== 'string' || !verifyPassword(b.password, user.password_hash)) {
      throw new HttpError(401, 'Špatný e-mail nebo heslo.');
    }
    res.json({ token: createSession(user.id), user: ownProfile(user) });
  });

  r.post('/logout', (req, res) => {
    const t = (req.get('authorization') ?? '').replace(/^Bearer /, '');
    db.prepare('DELETE FROM sessions WHERE token = ?').run(t);
    res.status(204).end();
  });

  return r;
}

export function requireAuth(db) {
  return (req, _res, next) => {
    const t = (req.get('authorization') ?? '').replace(/^Bearer /, '');
    const row = t && db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(t);
    const user = row && getUser(db, row.user_id);
    if (!user) throw new HttpError(401, 'Nejsi přihlášený/á.');
    req.user = user;
    next();
  };
}
