import { i18n } from './i18n';

// Formátování podle jazyka aplikace (místo napevno zadaného 'cs-CZ').

export const formatTime = (iso: string | number | Date) =>
  new Date(iso).toLocaleTimeString(i18n.intlLocale, { hour: '2-digit', minute: '2-digit' });

export const formatDate = (iso: string | number | Date, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'numeric' }) =>
  new Date(iso).toLocaleDateString(i18n.intlLocale, opts);

export const formatWeekday = (iso: string | number | Date) => new Date(iso).toLocaleDateString(i18n.intlLocale, { weekday: 'short' });

export const formatNumber = (n: number) => n.toLocaleString(i18n.intlLocale);

/** Výchozí ceny jsou v Kč; v obchodech je přepočítá Apple a Google podle země. */
export const formatPrice = (czk: number) =>
  new Intl.NumberFormat(i18n.intlLocale, { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(czk);
