// Překlady serveru. Slovníky shared/i18n/server/<jazyk>.json se načtou jednou při startu.
// Zdrojová řeč je čeština, chybějící klíč → angličtina → čeština → samotný klíč.
//
//   tr(locale, 'agreement.cooldown', { name })   – hotový text
//   msg('fields.password')                      – „líný“ text: přeloží se až podle jazyka příjemce
//                                                 (parametry chyb, push notifikace)
import { readFileSync } from 'node:fs';
import {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  LOCALE_CODES,
  createTranslator,
  isRTL,
  matchLocale,
  parseAcceptLanguage,
} from '../../shared/i18n/index.js';

export { DEFAULT_LOCALE, FALLBACK_LOCALE, isRTL, matchLocale };

const DIR = new URL('../../shared/i18n/server/', import.meta.url);

function loadDictionary(code) {
  try {
    return JSON.parse(readFileSync(new URL(`${code}.json`, DIR), 'utf8'));
  } catch (err) {
    // Zdrojový a záložní slovník musí být v pořádku – bez nich by SMS a chyby neměly text.
    if (code === DEFAULT_LOCALE || code === FALLBACK_LOCALE) throw err;
    if (err.code !== 'ENOENT') console.error(`[i18n] slovník ${code}.json nejde načíst:`, err.message);
    return {};
  }
}

const DICTIONARIES = Object.fromEntries(LOCALE_CODES.map((code) => [code, loadDictionary(code)]));

const PLURAL_KEYS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
const isPlural = (v) => v && typeof v === 'object' && 'other' in v && Object.keys(v).every((k) => PLURAL_KEYS.has(k));
const isNamespace = (v) => v && typeof v === 'object' && !Array.isArray(v) && !isPlural(v);

/** Hluboké spojení slovníků. Množné číslo je jedna hodnota – kategorie z různých jazyků se nesmí míchat. */
function merge(base, over) {
  const out = { ...base };
  for (const [key, value] of Object.entries(over ?? {})) {
    if (value === '' || value == null) continue;
    out[key] = isNamespace(value) && isNamespace(out[key]) ? merge(out[key], value) : value;
  }
  return out;
}

// Záloha pro všechny jazyky: angličtina, a co chybí i v ní, to čeština.
const FALLBACK = merge(DICTIONARIES[DEFAULT_LOCALE], DICTIONARIES[FALLBACK_LOCALE]);

/** Libovolný kód jazyka (i 'de-AT', 'xx') → podporovaný kód. Nic → výchozí čeština, neznámý jazyk → angličtina. */
export function normalizeLocale(locale) {
  if (!locale || typeof locale !== 'string') return DEFAULT_LOCALE;
  if (LOCALE_CODES.includes(locale)) return locale;
  return matchLocale([locale]);
}

const MSG = Symbol.for('fapp.i18n.msg');

/** Text, který se přeloží až podle jazyka toho, kdo ho uvidí. */
export const msg = (key, params) => ({ [MSG]: true, key, params });
export const isMsg = (value) => value != null && typeof value === 'object' && value[MSG] === true;

const translators = new Map();
function translatorFor(code) {
  let t = translators.get(code);
  if (!t) {
    t = createTranslator(code, DICTIONARIES[code] ?? {}, FALLBACK);
    translators.set(code, t);
  }
  return t;
}

/** Přeloží klíč. Parametry, které jsou msg(...), se přeloží do stejného jazyka (např. názvy polí). */
export function tr(locale, key, params) {
  const code = normalizeLocale(locale);
  let resolved = params;
  if (params) {
    resolved = {};
    for (const [name, value] of Object.entries(params)) resolved[name] = isMsg(value) ? tr(code, value.key, value.params) : value;
  }
  return translatorFor(code)(key, resolved);
}

/** msg(...) → přeložený text, obyčejný řetězec (jméno, text zprávy) zůstane, jak je. */
export const render = (locale, value) => (isMsg(value) ? tr(locale, value.key, value.params) : value);

/** Celý jmenný prostor pro klienta (stránka pro důvěryhodnou osobu) – už spojený se zálohou. */
export function namespace(locale, ns) {
  const code = normalizeLocale(locale);
  return merge(FALLBACK[ns] ?? {}, DICTIONARIES[code]?.[ns] ?? {});
}

// --- jazyk požadavku ---

const header = (req, name) => (typeof req.get === 'function' ? req.get(name) : req.headers?.[name]);

/** Jazyk, který aplikace výslovně zvolila (hlavička X-App-Locale), jinak null. */
export function explicitLocale(req) {
  const raw = String(header(req, 'x-app-locale') ?? '').trim();
  if (!raw || raw === '*') return null;
  return matchLocale([raw]);
}

/** X-App-Locale, jinak Accept-Language. Bez použitelné hlavičky (nebo jen „*“) null. */
export function headerLocale(req) {
  const explicit = explicitLocale(req);
  if (explicit) return explicit;
  const tags = parseAcceptLanguage(header(req, 'accept-language'));
  return tags.length > 0 ? matchLocale(tags) : null;
}

/** Jazyk odpovědi. Bez hlavičky čeština, aby se chování starších klientů nezměnilo. */
export const localeFromRequest = (req) => headerLocale(req) ?? DEFAULT_LOCALE;
