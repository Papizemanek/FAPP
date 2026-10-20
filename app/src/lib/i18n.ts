import { createTranslator, FALLBACK_LOCALE, isRTL, LOCALES, matchLocale, type Translate, type TranslateParams } from '@yesyes/shared/i18n';
import { getLocales } from 'expo-localization';
import { useSyncExternalStore } from 'react';
import { I18nManager } from 'react-native';
import { catalogs } from '@/i18n/catalog';
import { storage } from './storage';

// Jazyk aplikace: podle telefonu, nebo podle volby v profilu. Texty jsou v shared/i18n/app/<jazyk>.json
// (čeština je zdroj, angličtina záloha pro chybějící klíče).

const deviceLocale = () => matchLocale(getLocales().map((l) => l.languageTag));

const load = (code: string) => {
  try {
    return catalogs[code]?.() ?? {};
  } catch {
    return {};
  }
};

const fallback = load(FALLBACK_LOCALE);
let locale = deviceLocale();
let override: string | null = null;
let translate: Translate = createTranslator(locale, load(locale), fallback);
const listeners = new Set<() => void>();

function apply(code: string) {
  locale = code;
  translate = createTranslator(code, load(code), code === FALLBACK_LOCALE ? {} : fallback);
  // Zrcadlové rozložení (arabština, hebrejština, urdština) se projeví po dalším spuštění aplikace.
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL !== isRTL(code)) I18nManager.forceRTL(isRTL(code));
  listeners.forEach((fn) => fn());
}

export const i18n = {
  get locale() {
    return locale;
  },
  /** Jazyk zvolený v profilu (null = podle telefonu). */
  get override() {
    return override;
  },
  t: (key: string, params?: TranslateParams) => translate(key, params),
  /** Změna jazyka v profilu. null = zpátky podle telefonu. */
  async setLocale(code: string | null) {
    override = code && LOCALES.some((l) => l.code === code) ? code : null;
    await storage.setLanguage(override).catch(() => {});
    apply(override ?? deviceLocale());
  },
  /** Po startu načte jazyk zvolený v profilu. */
  async restore() {
    const saved = await storage.getLanguage().catch(() => null);
    if (saved && LOCALES.some((l) => l.code === saved)) {
      override = saved;
      if (saved !== locale) apply(saved);
    }
  },
  /** Jazyk pro formátování čísel a dat (Intl). */
  get intlLocale() {
    return locale;
  },
};

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Překladová funkce pro komponenty – po změně jazyka komponentu překreslí. */
export function useT(): Translate {
  return useSyncExternalStore(subscribe, () => translate, () => translate);
}

export function useLocale() {
  return useSyncExternalStore(subscribe, () => locale, () => locale);
}

/** Pro nekomponentový kód (notifikace, úlohy na pozadí). */
export const t = (key: string, params?: TranslateParams) => translate(key, params);
