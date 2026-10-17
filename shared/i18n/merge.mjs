// Spojí části slovníku aplikace (shared/i18n/app/_parts/<část>.<jazyk>.json) do app/<jazyk>.json.
// Části vznikají při převodu obrazovek na překladové klíče; hotové jazyky se pak už jen překládají.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), 'app');
const parts = path.join(dir, '_parts');
const byLang = {};
for (const file of fs.readdirSync(parts).filter((f) => f.endsWith('.json')).sort()) {
  const [, lang] = file.match(/^[^.]+\.(.+)\.json$/) ?? [];
  if (!lang) continue;
  const data = JSON.parse(fs.readFileSync(path.join(parts, file), 'utf8'));
  byLang[lang] ??= {};
  for (const [ns, value] of Object.entries(data)) {
    if (byLang[lang][ns]) throw new Error(`Jmenný prostor ${ns} je ve více částech (${file}).`);
    byLang[lang][ns] = value;
  }
}
for (const [lang, data] of Object.entries(byLang)) {
  fs.writeFileSync(path.join(dir, `${lang}.json`), JSON.stringify(data, null, 2) + '\n');
  console.log(lang, Object.keys(data).length, 'jmenných prostorů');
}
