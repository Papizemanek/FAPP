import { emailIndex } from './crypto.js';
import { newTotpSecret, otpauthUrl } from './security.js';
import { hashSecret, nowIso } from './util.js';

/** Nový moderátor. Vrací TOTP klíč a otpauth:// odkaz (ukáže se jen jednou, pro autentizační aplikaci). */
export function createModerator(db, { email, name, password }) {
  const address = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error('Neplatný e-mail.');
  if (String(password).length < 16) throw new Error('Heslo moderátora musí mít aspoň 16 znaků.');
  const secret = newTotpSecret();
  db.prepare(
    'INSERT INTO moderators (email_hash, email, name, password_hash, totp_secret, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(emailIndex(db.emailIndexKey, address), db.seal(address), String(name), hashSecret(password), db.seal(secret), nowIso());
  return { secret, otpauthUrl: otpauthUrl(secret, address, 'YesYes moderace') };
}
