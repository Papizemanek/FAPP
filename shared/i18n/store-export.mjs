// Export textů pro App Store a Google Play do složek ve formátu fastlane (deliver / supply):
//   app/fastlane/metadata/<apple-locale>/{name,subtitle,description,keywords,promotional_text,release_notes}.txt
//   app/fastlane/metadata/android/<play-locale>/{title,short_description,full_description}.txt
// Použití: node shared/i18n/store-export.mjs   (pak `fastlane deliver` / `fastlane supply`, nebo ruční vložení)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALE_CODES } from './index.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, '..', '..', 'app', 'fastlane', 'metadata');

// Naše kódy → lokalizace App Store Connect (Apple má u některých jazyků regionální varianty).
const APPLE = {
  ar: ['ar-SA'], bn: ['bn-BD'], ca: ['ca'], cs: ['cs'], da: ['da'], de: ['de-DE'], el: ['el'],
  en: ['en-US', 'en-GB', 'en-AU', 'en-CA'], es: ['es-ES', 'es-MX'], fi: ['fi'], fr: ['fr-FR', 'fr-CA'],
  gu: ['gu-IN'], he: ['he'], hi: ['hi'], hr: ['hr'], hu: ['hu'], id: ['id'], it: ['it'], ja: ['ja'],
  kn: ['kn-IN'], ko: ['ko'], ml: ['ml-IN'], mr: ['mr-IN'], ms: ['ms'], nb: ['no'], nl: ['nl-NL'],
  or: ['or-IN'], pa: ['pa-IN'], pl: ['pl'], 'pt-BR': ['pt-BR'], 'pt-PT': ['pt-PT'], ro: ['ro'], ru: ['ru'],
  sk: ['sk'], sl: ['sl-SI'], sv: ['sv'], ta: ['ta-IN'], te: ['te-IN'], th: ['th'], tr: ['tr'], uk: ['uk'],
  ur: ['ur-PK'], vi: ['vi'], 'zh-Hans': ['zh-Hans'], 'zh-Hant': ['zh-Hant'],
};

// Naše kódy → jazyky Google Play. Odia a pandžábštinu Play Console zatím nenabízí – ty se přeskočí.
const PLAY = {
  ar: ['ar'], bn: ['bn-BD'], ca: ['ca'], cs: ['cs-CZ'], da: ['da-DK'], de: ['de-DE'], el: ['el-GR'],
  en: ['en-US', 'en-GB'], es: ['es-ES', 'es-419'], fi: ['fi-FI'], fr: ['fr-FR', 'fr-CA'], gu: ['gu'],
  he: ['iw-IL'], hi: ['hi-IN'], hr: ['hr'], hu: ['hu-HU'], id: ['id'], it: ['it-IT'], ja: ['ja-JP'],
  kn: ['kn-IN'], ko: ['ko-KR'], ml: ['ml-IN'], mr: ['mr-IN'], ms: ['ms'], nb: ['no-NO'], nl: ['nl-NL'],
  pl: ['pl-PL'], 'pt-BR': ['pt-BR'], 'pt-PT': ['pt-PT'], ro: ['ro'], ru: ['ru-RU'], sk: ['sk'], sl: ['sl'],
  sv: ['sv-SE'], ta: ['ta-IN'], te: ['te-IN'], th: ['th'], tr: ['tr-TR'], uk: ['uk'], ur: ['ur'], vi: ['vi'],
  'zh-Hans': ['zh-CN'], 'zh-Hant': ['zh-TW'],
};

const write = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${String(text ?? '').trim()}\n`);
};

let ios = 0;
let android = 0;
const missing = [];
for (const code of LOCALE_CODES) {
  const file = path.join(dir, 'store', `${code}.json`);
  const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  if (!data.description) {
    missing.push(code);
    continue;
  }
  for (const locale of APPLE[code] ?? []) {
    const base = path.join(out, locale);
    write(path.join(base, 'name.txt'), data.name);
    write(path.join(base, 'subtitle.txt'), data.subtitle);
    write(path.join(base, 'description.txt'), data.description);
    write(path.join(base, 'keywords.txt'), data.keywords);
    write(path.join(base, 'promotional_text.txt'), data.promotionalText);
    write(path.join(base, 'release_notes.txt'), data.whatsNew);
    ios += 1;
  }
  for (const locale of PLAY[code] ?? []) {
    const base = path.join(out, 'android', locale);
    write(path.join(base, 'title.txt'), data.name);
    // Krátký popis má na Google Play limit 80 znaků – podtitul se do něj vejde vždy.
    write(path.join(base, 'short_description.txt'), data.subtitle);
    write(path.join(base, 'full_description.txt'), data.description);
    android += 1;
  }
}
console.log(`App Store: ${ios} lokalizací, Google Play: ${android} lokalizací → ${path.relative(process.cwd(), out)}`);
if (missing.length) console.log(`Zatím bez překladu: ${missing.join(', ')}`);
