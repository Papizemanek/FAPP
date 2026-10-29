import { Router } from 'express';
import { GENDERS, MIN_AGE } from '../../../shared/constants.js';
import { tokenHash } from '../crypto.js';
import { DEFAULT_LOCALE, explicitLocale, headerLocale, localeFromRequest, tr } from '../i18n.js';
import { getUser, ownProfile } from '../model.js';
import {
  DUMMY_PASSWORD_HASH,
  SESSION_COOKIE,
  SESSION_MAX_MS,
  assertNotLocked,
  checkSecondFactor,
  clearFailures,
  consumeCode,
  createSession,
  deviceLabel,
  emailKey,
  findSession,
  issueCode,
  recordFailure,
  revokeSessions,
} from '../security.js';
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
  parseJson,
  readCookie,
  str,
  token,
  verifySecret,
} from '../util.js';

const bearer = (req) => (req.get('authorization') ?? '').replace(/^Bearer /, '');

// Webová verze aplikace nedostane token do JavaScriptu: přihlášení je v cookie HttpOnly + SameSite=Strict
// a každý měnící požadavek musí nést hlavičku X-Requested-With (formulář z cizího webu ji poslat neumí → ochrana proti CSRF).
const isWebClient = (req) => req.get('x-client') === 'web';
export const CSRF_HEADER = 'yesyes';

function setSessionCookie(req, res, value, maxAgeMs) {
  const secure = req.secure ? '; Secure' : '';
  res.append(
    'Set-Cookie',
    `${SESSION_COOKIE}=${value}; Path=/api; Max-Age=${Math.floor(maxAgeMs / 1000)}; HttpOnly; SameSite=Strict${secure}`,
  );
}

const passwordField = (value, field = 'fields.password') => str(value, field, { min: 10, max: 200 });

/** Pošle bezpečnostní e-mail v jazyce příjemce. Chyba odeslání se jen zaloguje. */
export function sendSecurityEmail(services, to, locale, key, params = {}) {
  const subject = tr(locale, `email.${key}.subject`, params);
  const body = tr(locale, `email.${key}.body`, params);
  Promise.resolve(services.email.send(to, subject, body)).catch((err) => console.error('[e-mail]', err.message));
}

export function authRoutes({ db, limiter, services }) {
  const r = Router();

  /** Přihlášení na zařízení: aplikace dostane token, webová verze cookie. */
  const signIn = (req, res, user, status = 200) => {
    const web = isWebClient(req);
    const t = createSession(db, user.id, { kind: web ? 'web' : 'app', device: deviceLabel(req) });
    if (web) setSessionCookie(req, res, t, SESSION_MAX_MS);
    res.status(status).json({ token: web ? 'cookie' : t, user: ownProfile(getUser(db, user.id)) });
  };

  // Registrace ve dvou krocích: údaje → kód z e-mailu. Odpověď je pokaždé stejná, ať jde o nový
  // e-mail, nebo existující účet – podle ní nejde zjistit, kdo YesYes používá.
  r.post('/register', limiter('register', 5), (req, res) => {
    const b = req.body ?? {};
    const mail = email(b.email);
    const password = passwordField(b.password);
    const name = str(b.name, 'fields.name', { min: 2, max: 40 });
    const birthdate = date(b.birthdate, 'fields.birthdate');
    const gender = oneOf(b.gender, 'fields.gender', GENDERS);
    const interestedIn = listOf(b.interestedIn, 'fields.interestedIn', GENDERS, { min: 1 });

    if (!bool(b.confirmAdult)) throw new HttpError(400, 'auth.confirmAdult');
    if (!bool(b.acceptRules)) throw new HttpError(400, 'auth.acceptRules');
    const age = ageFrom(birthdate);
    if (age < MIN_AGE) throw new HttpError(403, 'auth.underage');
    if (age > 110) throw new HttpError(400, 'auth.invalidBirthdate');

    const key = emailKey(db, mail);
    const locale = localeFromRequest(req);
    const passwordHash = hashSecret(password);
    const existing = db.prepare('SELECT id, locale FROM users WHERE email_hash = ?').get(key);
    if (existing) {
      sendSecurityEmail(services, mail, existing.locale ?? locale, 'accountExists');
    } else {
      const payload = JSON.stringify({ name, birthdate, gender, interestedIn, passwordHash, locale });
      const code = issueCode(db, 'register', key, payload);
      sendSecurityEmail(services, mail, locale, 'registerCode', { code });
    }
    res.status(202).json({ pending: true });
  });

  r.post('/register/verify', limiter('register-verify', 10), (req, res) => {
    const mail = email(req.body?.email);
    const key = emailKey(db, mail);
    const payload = parseJson(consumeCode(db, 'register', key, req.body?.code), null);
    if (!payload) throw new HttpError(400, 'auth.badCode');
    // Mezitím mohl účet vzniknout z jiného zařízení.
    if (db.prepare('SELECT 1 FROM users WHERE email_hash = ?').get(key)) throw new HttpError(400, 'auth.badCode');
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO users (email, email_hash, password_hash, name, birthdate, gender, interested_in, locale, password_changed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        db.seal(mail),
        key,
        payload.passwordHash,
        db.seal(payload.name),
        db.seal(payload.birthdate),
        db.seal(payload.gender),
        db.seal(JSON.stringify(payload.interestedIn)),
        payload.locale ?? DEFAULT_LOCALE,
        nowIso(),
        nowIso(),
      );
    signIn(req, res, { id: Number(lastInsertRowid) }, 201);
  });

  r.post('/login', limiter('login', 10), (req, res) => {
    const b = req.body ?? {};
    const mail = String(b.email ?? '').trim().toLowerCase().slice(0, 200);
    const key = emailKey(db, mail);
    assertNotLocked(db, key);
    const user = mail ? db.prepare('SELECT * FROM users WHERE email_hash = ?').get(key) : null;
    const ok = verifySecret(b.password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
    if (!user || !ok) {
      recordFailure(db, key);
      throw new HttpError(401, 'auth.wrongCredentials');
    }
    clearFailures(db, key);
    if (user.status === 'banned') throw new HttpError(403, 'auth.banned');

    if (user.totp_enabled) {
      const challenge = token(32);
      db.prepare('DELETE FROM login_challenges WHERE user_id = ? OR expires_at < ?').run(user.id, nowIso());
      db.prepare('INSERT INTO login_challenges (token_hash, user_id, kind, device, expires_at) VALUES (?, ?, ?, ?, ?)').run(
        tokenHash(challenge),
        user.id,
        isWebClient(req) ? 'web' : 'app',
        deviceLabel(req),
        new Date(Date.now() + 5 * 60_000).toISOString(),
      );
      return res.json({ twoFactor: true, challenge });
    }
    sendSecurityEmail(services, user.email, user.locale, 'newLogin', { device: deviceLabel(req) });
    signIn(req, res, user);
  });

  // Druhý krok: kód z autentizační aplikace nebo záložní kód. Nejvýš 5 pokusů na jedno přihlášení.
  r.post('/login/2fa', limiter('login', 10), (req, res) => {
    const row = db.prepare('SELECT * FROM login_challenges WHERE token_hash = ?').get(tokenHash(String(req.body?.challenge ?? '')));
    if (!row || Date.parse(row.expires_at) <= Date.now() || row.attempts >= 5) throw new HttpError(401, 'auth.loginExpired');
    const user = getUser(db, row.user_id);
    if (!user || user.status === 'banned') throw new HttpError(401, 'auth.loginExpired');
    if (!checkSecondFactor(db, user, req.body?.code)) {
      db.prepare('UPDATE login_challenges SET attempts = attempts + 1 WHERE token_hash = ?').run(row.token_hash);
      throw new HttpError(400, 'auth.badCode');
    }
    db.prepare('DELETE FROM login_challenges WHERE token_hash = ?').run(row.token_hash);
    sendSecurityEmail(services, user.email, user.locale, 'newLogin', { device: row.device });
    signIn(req, res, user);
  });

  // Obnova hesla. Odpověď je vždy stejná – nejde podle ní zjistit, jestli účet existuje.
  r.post('/password/forgot', limiter('forgot', 5), (req, res) => {
    const mail = email(req.body?.email);
    const key = emailKey(db, mail);
    const user = db.prepare('SELECT id, locale FROM users WHERE email_hash = ?').get(key);
    if (user) sendSecurityEmail(services, mail, user.locale, 'resetCode', { code: issueCode(db, 'reset', key) });
    res.status(202).json({ pending: true });
  });

  r.post('/password/reset', limiter('forgot', 10), (req, res) => {
    const mail = email(req.body?.email);
    const key = emailKey(db, mail);
    const password = passwordField(req.body?.password);
    consumeCode(db, 'reset', key, req.body?.code);
    const user = db.prepare('SELECT id, locale FROM users WHERE email_hash = ?').get(key);
    if (!user) throw new HttpError(400, 'auth.badCode');
    db.prepare('UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?').run(hashSecret(password), nowIso(), user.id);
    revokeSessions(db, user.id);
    clearFailures(db, key);
    sendSecurityEmail(services, mail, user.locale, 'passwordChanged');
    res.status(204).end();
  });

  r.post('/logout', (req, res) => {
    const session = sessionFromRequest(db, req);
    if (session) db.prepare('DELETE FROM auth_sessions WHERE id = ?').run(session.id);
    if (isWebClient(req) || readCookie(req, SESSION_COOKIE)) setSessionCookie(req, res, '', 0);
    res.status(204).end();
  });

  // Expo push token tohoto zařízení.
  r.put('/push-token', requireAuth(db, { allowSuspended: true }), (req, res) => {
    const pushToken = str(req.body?.pushToken, 'fields.pushToken', { max: 200, optional: true }) || null;
    db.prepare('UPDATE auth_sessions SET push_token = ? WHERE id = ?').run(pushToken, req.session.id);
    res.status(204).end();
  });

  return r;
}

/** Přihlášení z požadavku: Bearer token (aplikace), nebo cookie s hlavičkou proti CSRF (web). */
export function sessionFromRequest(db, req) {
  const t = bearer(req);
  if (t && t !== 'cookie') return findSession(db, t);
  const cookie = readCookie(req, SESSION_COOKIE);
  if (!cookie) return null;
  // Čtení (např. <img> s fotkou) hlavičku poslat neumí; měnit data jde jen s ní.
  const safe = req.method === 'GET' || req.method === 'HEAD';
  if (!safe && req.get('x-requested-with') !== CSRF_HEADER) return null;
  return findSession(db, cookie);
}

/**
 * Přihlášený uživatel. Pozastavený účet smí jen to, co je nutné pro jeho vlastní bezpečí
 * (rozběhnutý bezpečnostní režim, profil, smazání účtu) – proto allowSuspended.
 */
export function requireAuth(db, { allowSuspended = false } = {}) {
  return (req, _res, next) => {
    const session = sessionFromRequest(db, req);
    const user = session && getUser(db, session.user_id);
    if (!user) throw new HttpError(401, 'auth.notLoggedIn');
    // Jazyk SMS a notifikací: aplikace ho posílá v X-App-Locale, změna se hned uloží.
    const explicit = explicitLocale(req);
    if (explicit && explicit !== user.locale) {
      db.prepare('UPDATE users SET locale = ? WHERE id = ?').run(explicit, user.id);
      user.locale = explicit;
    }
    // Bez hlavičky s jazykem mluví server s přihlášeným v jeho uloženém jazyce.
    req.locale = headerLocale(req) ?? user.locale ?? DEFAULT_LOCALE;
    if (user.status === 'banned') throw new HttpError(403, 'auth.banned');
    if (user.status === 'suspended' && !allowSuspended) {
      throw new HttpError(403, 'auth.suspended');
    }
    req.user = user;
    req.session = session;
    next();
  };
}

/** Seznamování je jen pro lidi s ověřenou totožností a věkem. */
export function requireVerified(req, _res, next) {
  if (req.user.verification_status !== 'approved') {
    throw new HttpError(403, 'auth.verifyFirst');
  }
  next();
}
