// Překlady sdílené aplikací, serverem a webem. Slovníky jsou JSON po doménách:
//   app/<locale>.json     – texty aplikace
//   server/<locale>.json  – chyby API, SMS, notifikace, stránka pro důvěryhodnou osobu
//   web/<locale>.json     – web a kampaň (bannery, videa)
//   store/<locale>.json   – texty pro App Store a Google Play
// Zdrojová řeč je čeština (cs), angličtina (en) je záloha pro chybějící klíče.

/** Jazyky, které podporuje App Store (lokalizace v App Store Connect). */
export const LOCALES = [
  { code: 'cs', name: 'Čeština' },
  { code: 'en', name: 'English' },
  { code: 'ar', name: 'العربية', rtl: true },
  { code: 'bn', name: 'বাংলা' },
  { code: 'ca', name: 'Català' },
  { code: 'da', name: 'Dansk' },
  { code: 'de', name: 'Deutsch' },
  { code: 'el', name: 'Ελληνικά' },
  { code: 'es', name: 'Español' },
  { code: 'fi', name: 'Suomi' },
  { code: 'fr', name: 'Français' },
  { code: 'gu', name: 'ગુજરાતી' },
  { code: 'he', name: 'עברית', rtl: true },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'hr', name: 'Hrvatski' },
  { code: 'hu', name: 'Magyar' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'it', name: 'Italiano' },
  { code: 'ja', name: '日本語' },
  { code: 'kn', name: 'ಕನ್ನಡ' },
  { code: 'ko', name: '한국어' },
  { code: 'ml', name: 'മലയാളം' },
  { code: 'mr', name: 'मराठी' },
  { code: 'ms', name: 'Bahasa Melayu' },
  { code: 'nb', name: 'Norsk bokmål' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'or', name: 'ଓଡ଼ିଆ' },
  { code: 'pa', name: 'ਪੰਜਾਬੀ' },
  { code: 'pl', name: 'Polski' },
  { code: 'pt-BR', name: 'Português (Brasil)' },
  { code: 'pt-PT', name: 'Português (Portugal)' },
  { code: 'ro', name: 'Română' },
  { code: 'ru', name: 'Русский' },
  { code: 'sk', name: 'Slovenčina' },
  { code: 'sl', name: 'Slovenščina' },
  { code: 'sv', name: 'Svenska' },
  { code: 'ta', name: 'தமிழ்' },
  { code: 'te', name: 'తెలుగు' },
  { code: 'th', name: 'ไทย' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'uk', name: 'Українська' },
  { code: 'ur', name: 'اردو', rtl: true },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'zh-Hans', name: '简体中文' },
  { code: 'zh-Hant', name: '繁體中文' },
];

export const DEFAULT_LOCALE = 'cs';
export const FALLBACK_LOCALE = 'en';
export const LOCALE_CODES = LOCALES.map((l) => l.code);
export const isRTL = (code) => !!LOCALES.find((l) => l.code === code)?.rtl;

/**
 * Vybere podporovaný jazyk podle preferencí zařízení nebo hlavičky Accept-Language
 * (např. ['de-AT', 'en-US'] → 'de'). Nepodporovaný jazyk → angličtina.
 */
export function matchLocale(tags, fallback = FALLBACK_LOCALE) {
  for (const raw of tags ?? []) {
    if (!raw) continue;
    const tag = String(raw).trim().replace('_', '-');
    const lower = tag.toLowerCase();
    const exact = LOCALE_CODES.find((c) => c.toLowerCase() === lower);
    if (exact) return exact;
    const [lang, ...rest] = lower.split('-');
    if (lang === 'zh') {
      const traditional = rest.some((p) => ['hant', 'tw', 'hk', 'mo'].includes(p));
      return traditional ? 'zh-Hant' : 'zh-Hans';
    }
    if (lang === 'pt') return rest.includes('pt') || rest.includes('ao') || rest.includes('mz') ? 'pt-PT' : 'pt-BR';
    if (lang === 'no' || lang === 'nn' || lang === 'nb') return 'nb';
    if (lang === 'iw') return 'he';
    if (lang === 'in') return 'id';
    const byLang = LOCALE_CODES.find((c) => c.toLowerCase() === lang);
    if (byLang) return byLang;
  }
  return fallback;
}

/** Hodnoty z hlavičky Accept-Language seřazené podle q. */
export function parseAcceptLanguage(header) {
  return String(header ?? '')
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { tag: tag.trim(), q: q ? Number(q.trim().slice(2)) || 0 : 1 };
    })
    .filter((x) => x.tag && x.tag !== '*')
    .sort((a, b) => b.q - a.q)
    .map((x) => x.tag);
}

const PLURAL_KEYS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
const isPlural = (v) => v && typeof v === 'object' && 'other' in v && Object.keys(v).every((k) => PLURAL_KEYS.has(k));

// Rod: hodnota { man, woman, other } se vybere podle params.gender ('man' | 'woman', jinak 'other').
// Jazyky bez rodu (angličtina…) mají obyčejný text. 'other' je i pro nebinární a neznámé.
const GENDER_KEYS = new Set(['man', 'woman', 'other']);
export const isGendered = (v) =>
  v && typeof v === 'object' && 'other' in v && ('man' in v || 'woman' in v) && Object.keys(v).every((k) => GENDER_KEYS.has(k));
const genderKey = (g) => (g === 'man' || g === 'woman' ? g : 'other');

function lookup(dict, key) {
  let node = dict;
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return node;
}

function pluralCategory(locale, count) {
  try {
    return new Intl.PluralRules(locale).select(count);
  } catch {
    return count === 1 ? 'one' : 'other';
  }
}

/**
 * t('discover.empty') nebo t('likes.count', { count: 3 }).
 * Proměnné ve tvaru {name}. Množné číslo: hodnota je objekt { one, few, many, other } podle CLDR.
 * Rod: hodnota { man, woman, other } podle params.gender (texty o druhém člověku: t('…', { name, gender })).
 * Chybějící klíč → záložní jazyk → samotný klíč (ať je hned vidět, co chybí).
 */
export function createTranslator(locale, dict, fallbackDict = {}, { defaultGender } = {}) {
  const resolve = (key, params) => {
    let value = lookup(dict, key);
    if (value === undefined || value === '') value = lookup(fallbackDict, key);
    if (value === undefined) return key;
    // Bez params.gender platí výchozí rod (v aplikaci rod přihlášeného – texty o sobě: „Zmeškal/a jsi…“).
    if (isGendered(value)) value = value[genderKey(params?.gender ?? defaultGender?.())] ?? value.other;
    if (isPlural(value)) {
      const count = Number(params?.count ?? 0);
      value = value[pluralCategory(locale, count)] ?? value.other;
    }
    if (typeof value !== 'string') return key;
    return params ? value.replace(/\{(\w+)\}/g, (m, name) => (params[name] === undefined ? m : String(params[name]))) : value;
  };
  return resolve;
}
