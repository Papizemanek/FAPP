export type LocaleCode = string;
export declare const LOCALES: { code: LocaleCode; name: string; rtl?: boolean }[];
export declare const DEFAULT_LOCALE: LocaleCode;
export declare const FALLBACK_LOCALE: LocaleCode;
export declare const LOCALE_CODES: LocaleCode[];
export declare function isRTL(code: LocaleCode): boolean;
export declare function matchLocale(tags: readonly (string | null | undefined)[] | undefined, fallback?: LocaleCode): LocaleCode;
export declare function parseAcceptLanguage(header: string | null | undefined): string[];
export type Dict = Record<string, unknown>;
export type TranslateParams = Record<string, string | number | null | undefined>;
export type Translate = (key: string, params?: TranslateParams) => string;
export declare function createTranslator(
  locale: LocaleCode,
  dict: Dict,
  fallbackDict?: Dict,
  options?: { defaultGender?: () => string | null | undefined },
): Translate;
export declare function isGendered(value: unknown): boolean;
