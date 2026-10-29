import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { emailIndex, safeEqual, tokenHash } from './crypto.js';
import { HttpError, hashSecret, nowIso, token } from './util.js';

// Přihlášení, jednorázové kódy, dvoufázové ověření a zpomalení hádání hesel.

// Přihlášení vyprší po 30 dnech nečinnosti a nejpozději po roce (pak je potřeba heslo znovu).
export const SESSION_IDLE_MS = 30 * 86400_000;
export const SESSION_MAX_MS = 365 * 86400_000;
const SESSION_TOUCH_MS = 3600_000;
export const SESSION_COOKIE = 'yy_session';

const iso = (ms) => new Date(ms).toISOString();

export function createSession(db, userId, { kind = 'app', device = '' } = {}) {
  const t = token(32);
  const now = Date.now();
  db.prepare(
    'INSERT INTO auth_sessions (token_hash, user_id, kind, device, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(tokenHash(t), userId, kind, device.slice(0, 80), iso(now), iso(now), iso(now + SESSION_IDLE_MS));
  return t;
}

/** Platné přihlášení k tokenu (a prodloužení při používání), jinak null. */
export function findSession(db, t) {
  if (!t) return null;
  const row = db.prepare('SELECT * FROM auth_sessions WHERE token_hash = ?').get(tokenHash(t));
  if (!row) return null;
  const now = Date.now();
  if (Date.parse(row.expires_at) <= now) {
    db.prepare('DELETE FROM auth_sessions WHERE id = ?').run(row.id);
    return null;
  }
  if (now - Date.parse(row.last_used_at) > SESSION_TOUCH_MS) {
    const expires = Math.min(now + SESSION_IDLE_MS, Date.parse(row.created_at) + SESSION_MAX_MS);
    db.prepare('UPDATE auth_sessions SET last_used_at = ?, expires_at = ? WHERE id = ?').run(iso(now), iso(expires), row.id);
  }
  return row;
}

export const revokeSessions = (db, userId, { except = null } = {}) =>
  db.prepare('DELETE FROM auth_sessions WHERE user_id = ? AND id != ?').run(userId, except ?? -1);

/** Popis zařízení pro seznam přihlášení (aplikace posílá X-Device, jinak User-Agent). */
export function deviceLabel(req) {
  const given = String(req.get('x-device') ?? '').replace(/[^\p{L}\p{N} .,()/_-]/gu, '').trim();
  if (given) return given.slice(0, 80);
  const ua = String(req.get('user-agent') ?? '');
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : '';
  const browser = /CriOS|Chrome/.test(ua) ? 'Chrome' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : '';
  return [browser, os].filter(Boolean).join(' · ') || 'Neznámé zařízení';
}

// --- zpomalení hádání hesel podle účtu (otisku e-mailu), nezávisle na IP ---
// Prvních 5 pokusů volně, pak zámek 1, 2, 4… minut (nejvýš hodinu). Platí i pro neexistující e-maily,
// ať zámek neprozradí, jestli účet existuje.
const FREE_FAILURES = 5;
const MAX_LOCK_MS = 3600_000;

export function assertNotLocked(db, key) {
  const row = db.prepare('SELECT locked_until FROM login_throttle WHERE key = ?').get(key);
  if (row?.locked_until && Date.parse(row.locked_until) > Date.now()) {
    throw new HttpError(429, 'auth.tooManyAttempts', { retryAt: row.locked_until });
  }
}

export function recordFailure(db, key) {
  const row = db.prepare('SELECT failures FROM login_throttle WHERE key = ?').get(key);
  const failures = (row?.failures ?? 0) + 1;
  const lockedUntil =
    failures >= FREE_FAILURES ? iso(Date.now() + Math.min(MAX_LOCK_MS, 60_000 * 2 ** (failures - FREE_FAILURES))) : null;
  db.prepare(
    `INSERT INTO login_throttle (key, failures, locked_until, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET failures = excluded.failures, locked_until = excluded.locked_until, updated_at = excluded.updated_at`,
  ).run(key, failures, lockedUntil, nowIso());
}

export const clearFailures = (db, key) => db.prepare('DELETE FROM login_throttle WHERE key = ?').run(key);

// Ověření hesla stojí stejně dlouho i u neexistujícího účtu (jinak by čas odpovědi prozradil, kdo tu je).
export const DUMMY_PASSWORD_HASH = hashSecret(randomBytes(16).toString('hex'));

// --- jednorázové kódy z e-mailu ---
const CODE_TTL_MS = 15 * 60_000;
const CODE_ATTEMPTS = 5;

/** Vytvoří 6místný kód pro daný účel a e-mail (předchozí kódy téhož účelu zneplatní). */
export function issueCode(db, purpose, emailHash, payload = '') {
  db.prepare('DELETE FROM email_codes WHERE purpose = ? AND email_hash = ?').run(purpose, emailHash);
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const now = Date.now();
  db.prepare(
    'INSERT INTO email_codes (purpose, email_hash, code_hash, payload, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(purpose, emailHash, tokenHash(`${purpose}:${emailHash}:${code}`), payload ? db.seal(payload) : '', iso(now), iso(now + CODE_TTL_MS));
  return code;
}

/** Ověří kód; po 5 chybách nebo vypršení přestane platit. Vrací payload (dešifrovaný). */
export function consumeCode(db, purpose, emailHash, code) {
  const row = db.prepare('SELECT * FROM email_codes WHERE purpose = ? AND email_hash = ?').get(purpose, emailHash);
  const bad = () => new HttpError(400, 'auth.badCode');
  if (!row || Date.parse(row.expires_at) <= Date.now() || row.attempts >= CODE_ATTEMPTS) throw bad();
  const given = String(code ?? '').replace(/\D/g, '');
  if (!safeEqual(tokenHash(`${purpose}:${emailHash}:${given}`), row.code_hash)) {
    db.prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    throw bad();
  }
  db.prepare('DELETE FROM email_codes WHERE id = ?').run(row.id);
  return row.payload;
}

export const emailKey = (db, address) => emailIndex(db.emailIndexKey, address);

// --- TOTP (RFC 6238): 30s kroky, 6 číslic, SHA-1 (kompatibilní se všemi autentizačními aplikacemi) ---
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function newTotpSecret() {
  const bytes = randomBytes(20);
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(s) {
  let bits = '';
  for (const ch of s.replace(/=+$/, '').toUpperCase()) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error('Neplatný TOTP klíč.');
    bits += v.toString(2).padStart(5, '0');
  }
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}

export function totpAt(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(bin % 1_000_000).padStart(6, '0');
}

/**
 * Ověří kód s tolerancí ±1 krok (posun hodin). Vrací použitý krok, nebo null.
 * lastStep brání opakovanému použití téhož kódu (replay).
 */
export function verifyTotp(secret, code, lastStep = 0, now = Date.now()) {
  const given = String(code ?? '').replace(/\D/g, '');
  if (given.length !== 6) return null;
  const step = Math.floor(now / 30_000);
  for (const s of [step - 1, step, step + 1]) {
    if (s > lastStep && safeEqual(totpAt(secret, s), given)) return s;
  }
  return null;
}

export const otpauthUrl = (secret, account, issuer = 'YesYes') =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

/** 10 záložních kódů (formát xxxx-xxxx), uložené jen jako otisky. */
export function issueRecoveryCodes(db, userId) {
  db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(userId);
  const insert = db.prepare('INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)');
  const codes = [];
  for (let i = 0; i < 10; i++) {
    const raw = randomBytes(5).toString('hex');
    const code = `${raw.slice(0, 5)}-${raw.slice(5)}`;
    insert.run(userId, tokenHash(`recovery:${userId}:${raw}`));
    codes.push(code);
  }
  return codes;
}

export function useRecoveryCode(db, userId, code) {
  const raw = String(code ?? '').toLowerCase().replace(/[^0-9a-f]/g, '');
  if (raw.length !== 10) return false;
  const res = db
    .prepare('UPDATE recovery_codes SET used_at = ? WHERE user_id = ? AND code_hash = ? AND used_at IS NULL')
    .run(nowIso(), userId, tokenHash(`recovery:${userId}:${raw}`));
  return res.changes > 0;
}

/** Druhý krok přihlášení: TOTP kód, nebo záložní kód. Při úspěchu posune poslední použitý krok. */
export function checkSecondFactor(db, user, code) {
  const secret = user.totp_secret;
  const step = secret ? verifyTotp(secret, code, user.totp_last_step) : null;
  if (step) {
    db.prepare('UPDATE users SET totp_last_step = ? WHERE id = ?').run(step, user.id);
    return true;
  }
  return useRecoveryCode(db, user.id, code);
}
