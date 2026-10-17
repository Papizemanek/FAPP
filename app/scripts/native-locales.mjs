// Přeložené systémové texty pro iOS (InfoPlist.strings – žádosti o polohu, Face ID, fotky, kameru).
// Pro každý jazyk z LOCALES vezme jmenný prostor `native` ze shared/i18n/app/<jazyk>.json a zapíše
// app/locales/<jazyk>.json, který app.config.ts předá Expu v `locales`. Chybějící texty doplní angličtinou.
// Výchozí (české) texty v Info.plist nastavuje app.config.ts. Spuštění: node app/scripts/native-locales.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_LOCALE, FALLBACK_LOCALE, LOCALES } from '../../shared/i18n/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dictDir = path.join(here, '../../shared/i18n/app');
const outDir = path.join(here, '../locales');

/** Klíč v Info.plist → klíč v jmenném prostoru `native`. */
const KEYS = {
  NSLocationWhenInUseUsageDescription: 'locationWhenInUse',
  NSLocationAlwaysAndWhenInUseUsageDescription: 'locationAlways',
  NSFaceIDUsageDescription: 'faceId',
  NSPhotoLibraryUsageDescription: 'photos',
  NSCameraUsageDescription: 'camera',
};

// Klíč v `locales` je název složky <id>.lproj, takže musí být identifikátor jazyka podle Applu.
// Naše kódy (zh-Hans, zh-Hant, pt-BR, pt-PT, nb, he, id…) už mu odpovídají; výjimky by patřily sem.
const APPLE_LOCALE = {};
const appleId = (code) => APPLE_LOCALE[code] ?? code;

const readNative = (code) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dictDir, `${code}.json`), 'utf8')).native ?? {};
  } catch {
    return {};
  }
};

// Expo zapisuje hodnoty do .strings bez escapování – uvozovky a zpětná lomítka escapujeme tady.
const escapeStrings = (value) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

const fallback = readNative(FALLBACK_LOCALE);
const source = readNative(DEFAULT_LOCALE);
const missingFallback = Object.values(KEYS).filter((k) => !fallback[k]);
if (missingFallback.length) throw new Error(`V ${FALLBACK_LOCALE}.json chybí native.${missingFallback.join(', native.')}`);

fs.mkdirSync(outDir, { recursive: true });
const written = [];
for (const { code } of LOCALES) {
  const native = readNative(code);
  const ios = { CFBundleDisplayName: 'F*app' };
  let translated = 0;
  for (const [plistKey, key] of Object.entries(KEYS)) {
    const own = typeof native[key] === 'string' && native[key].trim() ? native[key] : null;
    if (own) translated++;
    ios[plistKey] = escapeStrings(own ?? fallback[key] ?? source[key]);
  }
  const file = `${appleId(code)}.json`;
  fs.writeFileSync(path.join(outDir, file), JSON.stringify({ ios }, null, 2) + '\n');
  written.push(file);
  console.log(code, `${translated}/${Object.keys(KEYS).length}`, 'přeloženo');
}

// Soubory jazyků, které už v LOCALES nejsou, smažeme, ať je app.config.ts nepředává dál.
for (const file of fs.readdirSync(outDir)) {
  if (file.endsWith('.json') && !written.includes(file)) fs.rmSync(path.join(outDir, file));
}
