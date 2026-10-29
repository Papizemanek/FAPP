import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { DEFAULT_LOCALE, msg, tr } from './i18n.js';

export class HttpError extends Error {
  /**
   * key = překladový klíč ze shared/i18n/server (přeloží ho obsluha chyb v app.js podle jazyka požadavku).
   * data = { params, ...strojově čitelné doplňky odpovědi (např. { code: 'like_limit', resetAt }) }.
   * params jsou jen pro překlad a do odpovědi se neposílají.
   */
  constructor(status, key, data = undefined) {
    const { params, ...extra } = data ?? {};
    super(tr(DEFAULT_LOCALE, key, params));
    this.status = status;
    this.key = key;
    this.params = params;
    this.data = data ? extra : undefined;
  }
}

export const nowIso = () => new Date().toISOString();

export function readCookie(req, name) {
  for (const part of String(req.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export const token = (bytes = 24) => randomBytes(bytes).toString('base64url');

export function hashSecret(secret) {
  const salt = randomBytes(16);
  const hash = scryptSync(secret, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifySecret(secret, stored) {
  if (!stored || typeof secret !== 'string') return false;
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(secret, Buffer.from(saltHex, 'hex'), expected.length);
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

// Mřížka ~1,1 km. Přesnou polohu domova nikdy neukládáme.
export const snapToGrid = (deg) => Math.round(deg * 100) / 100;

export const parseJson = (text, fallback) => {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};

// --- validace vstupů ---
// field = překladový klíč názvu pole (např. 'fields.password'), do chyby se vloží přeložený.

const invalid = (key, field, params = {}) => new HttpError(400, key, { params: { field: msg(field), ...params } });

export function str(value, field, { min = 0, max = 500, optional = false } = {}) {
  if (value === undefined || value === null) {
    if (optional) return '';
    throw invalid('validation.required', field);
  }
  if (typeof value !== 'string') throw invalid('validation.notText', field);
  const trimmed = value.trim();
  if (trimmed.length < min) throw invalid('validation.tooShort', field);
  if (trimmed.length > max) throw invalid('validation.tooLong', field);
  return trimmed;
}

export function int(value, field, { min, max }) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw invalid('validation.integer', field, { min, max });
  }
  return n;
}

export function num(value, field, { min, max }) {
  const n = Number(value);
  if (value === null || value === undefined || !Number.isFinite(n) || n < min || n > max) {
    throw invalid('validation.invalidValue', field);
  }
  return n;
}

export function oneOf(value, field, allowed) {
  if (typeof value !== 'string' || !Object.hasOwn(allowed, value)) {
    throw invalid('validation.invalidValue', field);
  }
  return value;
}

export function listOf(value, field, allowed, { min = 0 } = {}) {
  if (!Array.isArray(value)) throw invalid('validation.notList', field);
  const unique = [...new Set(value)];
  for (const item of unique) oneOf(item, field, allowed);
  if (unique.length < min) throw invalid('validation.minOptions', field, { count: min });
  return unique;
}

export const bool = (value) => value === true;

export function date(value, field) {
  const s = str(value, field, { max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) {
    throw invalid('validation.date', field);
  }
  return s;
}

export function dateTime(value, field) {
  const s = str(value, field, { max: 40 });
  const t = Date.parse(s);
  if (Number.isNaN(t)) throw invalid('validation.dateTime', field);
  return new Date(t).toISOString();
}

export function email(value) {
  const s = str(value, 'fields.email', { max: 200 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new HttpError(400, 'validation.email');
  return s;
}

/** Telefon v mezinárodním formátu. Bez předvolby doplní +420. */
export function phone(value, field) {
  const raw = str(value, field, { max: 30 }).replace(/[\s()-]/g, '');
  const normalized = raw.startsWith('+') ? raw : raw.startsWith('00') ? `+${raw.slice(2)}` : `+420${raw}`;
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw invalid('validation.phone', field);
  return normalized;
}

export function pin(value, field) {
  if (typeof value !== 'string' || !/^\d{4,6}$/.test(value)) {
    throw invalid('validation.pin', field);
  }
  return value;
}
