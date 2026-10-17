import { tr } from '../i18n.js';
import { RULES } from './moderation.js';

const WARNING_KEYS = new Set(RULES.map((r) => r.messageKey));
// Starší zprávy mají v DB uložený přímo český text upozornění – i ty se přeloží.
const LEGACY_WARNINGS = new Map(RULES.map((r) => [tr('cs', r.messageKey), r.messageKey]));

/** Upozornění u zprávy v jazyce příjemce. Neznámý text (starší záznam) projde beze změny. */
export function warningText(stored, locale) {
  if (!stored) return '';
  const key = WARNING_KEYS.has(stored) ? stored : LEGACY_WARNINGS.get(stored);
  return key ? tr(locale, key) : stored;
}
