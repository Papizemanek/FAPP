// Kontrola překladů: stejné klíče jako angličtina, stejné proměnné {x}, množné číslo vždy s „other“
// a limity délky pro App Store. Použití: node shared/i18n/check.mjs [jazyk …]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALE_CODES } from './index.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const DOMAINS = ['app', 'web', 'store', 'server'];
const PLURAL = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
const STORE_LIMITS = { name: 30, subtitle: 30, promotionalText: 170, keywords: 100, description: 4000, whatsNew: 4000 };

// Rod ({ man, woman, other }) má v jazycích s rodem stejnou roli jako obyčejný text v angličtině.
const GENDER = new Set(['man', 'woman', 'other']);
const isGendered = (v) => v && typeof v === 'object' && 'other' in v && ('man' in v || 'woman' in v) && Object.keys(v).every((k) => GENDER.has(k));
const flat = (v) => (isGendered(v) ? Object.values(v).join(' ') : v);
const isPlural = (v) => v && typeof v === 'object' && !Array.isArray(v) && 'other' in v && Object.keys(v).every((k) => PLURAL.has(k));
const params = (s) => [...new Set([...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort().join(',');
const load = (domain, code) => {
  const file = path.join(dir, domain, `${code}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
};

const wanted = process.argv.slice(2);
const codes = (wanted.length ? wanted : LOCALE_CODES).filter((c) => c !== 'en');
let problems = 0;
const report = (code, domain, msg) => {
  problems += 1;
  console.log(`${code} ${domain}: ${msg}`);
};

function compare(code, domain, ref, cur, prefix) {
  for (const [key, refVal] of Object.entries(ref)) {
    const at = prefix ? `${prefix}.${key}` : key;
    const val = cur?.[key];
    if (val === undefined || val === '') {
      report(code, domain, `chybí ${at}`);
      continue;
    }
    if (isGendered(refVal) || isGendered(val)) {
      if (typeof val !== 'string' && !isGendered(val)) report(code, domain, `${at} má být text nebo rod ({man, woman, other})`);
      else if (params(flat(refVal)) !== params(flat(val))) report(code, domain, `${at}: jiné proměnné než v angličtině`);
      continue;
    }
    if (isPlural(refVal) || isPlural(val)) {
      if (!isPlural(val)) report(code, domain, `${at} má být množné číslo ({one, …, other})`);
      else if (params(Object.values(refVal).join(' ')) !== params(Object.values(val).join(' ')))
        report(code, domain, `${at}: jiné proměnné než v angličtině`);
      continue;
    }
    if (typeof refVal === 'object') {
      if (typeof val !== 'object') report(code, domain, `${at} má být objekt`);
      else compare(code, domain, refVal, val, at);
      continue;
    }
    if (typeof val !== 'string') report(code, domain, `${at} má být text`);
    else if (params(refVal) !== params(val)) report(code, domain, `${at}: proměnné ${params(val) || '–'} místo ${params(refVal) || '–'}`);
  }
  for (const key of Object.keys(cur ?? {})) {
    if (!(key in ref)) report(code, domain, `navíc ${prefix ? `${prefix}.` : ''}${key}`);
  }
}

for (const code of codes) {
  for (const domain of DOMAINS) {
    const ref = load(domain, 'en');
    const cur = load(domain, code);
    if (!Object.keys(ref).length) continue;
    if (!Object.keys(cur).length) {
      if (wanted.length) report(code, domain, 'soubor je prázdný');
      continue;
    }
    compare(code, domain, ref, cur, '');
    if (domain === 'store') {
      for (const [key, max] of Object.entries(STORE_LIMITS)) {
        if (typeof cur[key] === 'string' && [...cur[key]].length > max) report(code, domain, `${key} má ${[...cur[key]].length} znaků, limit ${max}`);
      }
    }
  }
}
console.log(problems ? `Problémů: ${problems}` : 'Překlady v pořádku.');
process.exitCode = problems ? 1 : 0;
