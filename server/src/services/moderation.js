// Automatická moderace textu (zprávy v chatu, „o mně“). Jednoduchá pravidla nad normalizovaným
// textem; rozhraní moderate(text) -> verdikt je připravené na výměnu za ML/LLM klasifikátor.
//
// Akce:
//   block – zpráva se nedoručí, autor dostane vysvětlení, moderátoři dostanou příznak
//   warn  – zpráva se doručí, příjemce uvidí bezpečnostní upozornění
//   allow – nic

const normalize = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');

const RULES = [
  {
    id: 'minor',
    action: 'block',
    priority: 'high',
    message: 'Zpráva naznačuje, že někdo z vás může být nezletilý. F*app je jen pro 18+.',
    patterns: [
      /\bje mi (1[0-7]|[1-9])\b(?!\s*(minut|hodin|dn|mesic|tyd))/,
      /\b(mam|jsem|bude mi)\s*(1[0-7])\s*(let|r\b|rok)/,
      /\b(1[0-7])\s*(let|lety)\s*(mi je|je mi)\b/,
      /\bnezletil/,
      /\b(chodim|jsem)\s+(na|do)\s+(zakladk|zs\b|stredn|gympl|gymnazi|devitk|osmick|sedmick)/,
    ],
  },
  {
    id: 'paid',
    action: 'block',
    priority: 'normal',
    message: 'Nabízení nebo poptávání placeného sexu je na F*app zakázané.',
    patterns: [
      /\b\d{3,6}\s*(kc|czk|eur|euro|€|,-)\s*(za|na)\s*(hodin|hod\b|noc|sex|schuzk|setkan|vecer)/,
      /\b(za|na)\s*(hodin|hod\b|noc|sex|schuzk)\w*\s*\d{3,6}\s*(kc|czk|eur|€|,-)/,
      /\b(escort|eskort|sponzor|sugar ?dadd|financni (odmen|podpor)|platim za sex|za uplatu|privat\b)/,
    ],
  },
  {
    // Tlak typu „v appce jsi souhlasila“ – domluva v aplikaci není souhlas.
    id: 'consent_pressure',
    action: 'warn',
    flag: true,
    priority: 'high',
    message:
      'Pozor: domluva v aplikaci není souhlas. Můžeš ji kdykoli zrušit a na místě cokoli odmítnout – bez vysvětlování.',
    patterns: [
      /\b(v|na|pres) (appce|apce|appku|apku|aplikaci|fappu?)\b.{0,40}\b(souhlasil|potvrdil|odklikl|slibil|odsouhlasil|zaskrtl|dal[ao]? souhlas)/,
      /\b(souhlasil|potvrdil|odklikl|slibil|odsouhlasil|zaskrtl)\w*\b.{0,20}\b(v|na|pres) (appce|apce|appku|apku|aplikaci|fappu?)\b/,
      /\b(uz|prece|stejne) jsi (to )?(souhlasil|potvrdil|odklikl|slibil|odsouhlasil)/,
      /\b(nemuzes|nesmis|nejde) (to )?(vzit|brat|dat) (zpet|zpatky)\b/,
      /\bdohoda je dohoda\b/,
      /\b(mas|mame) to (potvrzene|odsouhlasene|odkliknute)\b/,
    ],
  },
  {
    id: 'contact',
    action: 'warn',
    priority: 'low',
    message:
      'Protějšek sdílí kontakt mimo aplikaci. Mimo F*app pro vás nefunguje domluva, bezpečnostní režim ani nahlášení.',
    patterns: [
      /(\+?420)?\s*\d{3}\s*\d{3}\s*\d{3}\b/,
      /\b(whatsapp|whats app|telegram|instagram|insta|snapchat|snap|messenger|onlyfans)\b/,
    ],
  },
];

export function moderate(text) {
  const t = normalize(text);
  const hits = RULES.filter((rule) => rule.patterns.some((p) => p.test(t)));
  const block = hits.find((h) => h.action === 'block');
  if (block) return { action: 'block', rule: block.id, priority: block.priority, message: block.message };
  const warn = hits.find((h) => h.action === 'warn');
  if (warn) return { action: 'warn', rule: warn.id, priority: warn.priority, message: warn.message, flag: !!warn.flag };
  return { action: 'allow' };
}
