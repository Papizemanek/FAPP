import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const nowIso = () => new Date().toISOString();

export const token = () => randomBytes(24).toString('base64url');

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

export function ageFrom(birthdate, today = new Date()) {
  const [y, m, d] = birthdate.split('-').map(Number);
  let age = today.getUTCFullYear() - y;
  const beforeBirthday = today.getUTCMonth() + 1 < m || (today.getUTCMonth() + 1 === m && today.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

export function distanceKm(lat1, lng1, lat2, lng2) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const parseJson = (text, fallback) => {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};

// --- validace vstupů ---

export function str(value, field, { min = 0, max = 500, optional = false } = {}) {
  if (value === undefined || value === null) {
    if (optional) return '';
    throw new HttpError(400, `Chybí pole ${field}.`);
  }
  if (typeof value !== 'string') throw new HttpError(400, `Pole ${field} musí být text.`);
  const trimmed = value.trim();
  if (trimmed.length < min) throw new HttpError(400, `Pole ${field} je příliš krátké.`);
  if (trimmed.length > max) throw new HttpError(400, `Pole ${field} je příliš dlouhé.`);
  return trimmed;
}

export function int(value, field, { min, max }) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `Pole ${field} musí být celé číslo ${min}–${max}.`);
  }
  return n;
}

export function num(value, field, { min, max }) {
  const n = Number(value);
  if (value === null || value === undefined || !Number.isFinite(n) || n < min || n > max) {
    throw new HttpError(400, `Neplatná hodnota pole ${field}.`);
  }
  return n;
}

export function oneOf(value, field, allowed) {
  if (!Object.hasOwn(allowed, value)) throw new HttpError(400, `Neplatná hodnota pole ${field}.`);
  return value;
}

export function listOf(value, field, allowed, { min = 0 } = {}) {
  if (!Array.isArray(value)) throw new HttpError(400, `Pole ${field} musí být seznam.`);
  const unique = [...new Set(value)];
  for (const item of unique) oneOf(item, field, allowed);
  if (unique.length < min) throw new HttpError(400, `V poli ${field} vyber aspoň ${min} možnost.`);
  return unique;
}

export function bool(value) {
  return value === true;
}

export function date(value, field) {
  const s = str(value, field, { max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) {
    throw new HttpError(400, `Pole ${field} musí být datum ve formátu RRRR-MM-DD.`);
  }
  return s;
}

export function dateTime(value, field) {
  const s = str(value, field, { max: 40 });
  const t = Date.parse(s);
  if (Number.isNaN(t)) throw new HttpError(400, `Pole ${field} musí být datum a čas.`);
  return new Date(t).toISOString();
}

export function photo(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) {
    throw new HttpError(400, 'Fotka musí být obrázek JPEG, PNG nebo WebP.');
  }
  if (value.length > 700_000) throw new HttpError(400, 'Fotka je příliš velká.');
  return value;
}

export function email(value) {
  const s = str(value, 'e-mail', { max: 200 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new HttpError(400, 'Neplatný e-mail.');
  return s;
}
