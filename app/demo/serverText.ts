// Demo: slovníky serveru, aby simulovaný backend mluvil stejným jazykem jako aplikace.
/* eslint-disable @typescript-eslint/no-require-imports */
import { createTranslator, FALLBACK_LOCALE, type TranslateParams } from '@yesyes/shared/i18n';
import { i18n } from '../src/lib/i18n';

const catalogs: Record<string, () => Record<string, unknown>> = {
  cs: () => require('@yesyes/shared/i18n/server/cs.json'),
  en: () => require('@yesyes/shared/i18n/server/en.json'),
  ar: () => require('@yesyes/shared/i18n/server/ar.json'),
  bn: () => require('@yesyes/shared/i18n/server/bn.json'),
  ca: () => require('@yesyes/shared/i18n/server/ca.json'),
  da: () => require('@yesyes/shared/i18n/server/da.json'),
  de: () => require('@yesyes/shared/i18n/server/de.json'),
  el: () => require('@yesyes/shared/i18n/server/el.json'),
  es: () => require('@yesyes/shared/i18n/server/es.json'),
  fi: () => require('@yesyes/shared/i18n/server/fi.json'),
  fr: () => require('@yesyes/shared/i18n/server/fr.json'),
  gu: () => require('@yesyes/shared/i18n/server/gu.json'),
  he: () => require('@yesyes/shared/i18n/server/he.json'),
  hi: () => require('@yesyes/shared/i18n/server/hi.json'),
  hr: () => require('@yesyes/shared/i18n/server/hr.json'),
  hu: () => require('@yesyes/shared/i18n/server/hu.json'),
  id: () => require('@yesyes/shared/i18n/server/id.json'),
  it: () => require('@yesyes/shared/i18n/server/it.json'),
  ja: () => require('@yesyes/shared/i18n/server/ja.json'),
  kn: () => require('@yesyes/shared/i18n/server/kn.json'),
  ko: () => require('@yesyes/shared/i18n/server/ko.json'),
  ml: () => require('@yesyes/shared/i18n/server/ml.json'),
  mr: () => require('@yesyes/shared/i18n/server/mr.json'),
  ms: () => require('@yesyes/shared/i18n/server/ms.json'),
  nb: () => require('@yesyes/shared/i18n/server/nb.json'),
  nl: () => require('@yesyes/shared/i18n/server/nl.json'),
  or: () => require('@yesyes/shared/i18n/server/or.json'),
  pa: () => require('@yesyes/shared/i18n/server/pa.json'),
  pl: () => require('@yesyes/shared/i18n/server/pl.json'),
  'pt-BR': () => require('@yesyes/shared/i18n/server/pt-BR.json'),
  'pt-PT': () => require('@yesyes/shared/i18n/server/pt-PT.json'),
  ro: () => require('@yesyes/shared/i18n/server/ro.json'),
  ru: () => require('@yesyes/shared/i18n/server/ru.json'),
  sk: () => require('@yesyes/shared/i18n/server/sk.json'),
  sl: () => require('@yesyes/shared/i18n/server/sl.json'),
  sv: () => require('@yesyes/shared/i18n/server/sv.json'),
  ta: () => require('@yesyes/shared/i18n/server/ta.json'),
  te: () => require('@yesyes/shared/i18n/server/te.json'),
  th: () => require('@yesyes/shared/i18n/server/th.json'),
  tr: () => require('@yesyes/shared/i18n/server/tr.json'),
  uk: () => require('@yesyes/shared/i18n/server/uk.json'),
  ur: () => require('@yesyes/shared/i18n/server/ur.json'),
  vi: () => require('@yesyes/shared/i18n/server/vi.json'),
  'zh-Hans': () => require('@yesyes/shared/i18n/server/zh-Hans.json'),
  'zh-Hant': () => require('@yesyes/shared/i18n/server/zh-Hant.json'),
};

const load = (code: string) => {
  try {
    return catalogs[code]?.() ?? {};
  } catch {
    return {};
  }
};

/** Text serveru v jazyce, který má právě nastavený aplikace. */
export function srv(key: string, params?: TranslateParams) {
  const code = i18n.locale;
  return createTranslator(code, load(code), code === FALLBACK_LOCALE ? {} : load(FALLBACK_LOCALE))(key, params);
}

// Chyby simulovaného backendu jsou česky (převzaté ze serveru) – přeložíme je přes stejné klíče jako server.
const reverse = new Map<string, string>();
(function index(node: unknown, prefix: string) {
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string' && !v.includes('{')) reverse.set(v, key);
    else index(v, key);
  }
})(load('cs'), '');

export const translateError = (czech: string) => {
  const key = reverse.get(czech);
  return key ? srv(key) : czech;
};
