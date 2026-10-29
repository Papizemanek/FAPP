// Šifrovaná záloha databáze: konzistentní kopie (VACUUM INTO) → AES-256-GCM klíčem BACKUP_KEY.
// Záloha je čitelná jen s BACKUP_KEY a data v ní jsou navíc šifrovaná po sloupcích (DATA_KEY).
//   záloha:   BACKUP_KEY=… npm run backup -w server -- /cesta/k/zaloze.yyb
//   obnova:   BACKUP_KEY=… npm run restore -w server -- /cesta/k/zaloze.yyb /cesta/k/yesyes.db
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { loadConfig } from '../src/config.js';

const MAGIC = Buffer.from('YYBACKUP1');
const key = Buffer.from(process.env.BACKUP_KEY ?? '', 'base64');
if (key.length !== 32) throw new Error('BACKUP_KEY musí být 32 bajtů v base64 (openssl rand -base64 32). Ulož ho jinam než zálohy.');

const [mode, ...args] = process.argv.slice(2);
if (mode === 'backup') {
  const target = args[0] ?? `yesyes-${new Date().toISOString().replace(/[:.]/g, '-')}.yyb`;
  const config = loadConfig();
  const tmp = `${target}.tmp-sqlite`;
  rmSync(tmp, { force: true });
  const db = new DatabaseSync(config.dbFile);
  db.prepare('VACUUM INTO ?').run(tmp);
  db.close();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(readFileSync(tmp)), cipher.final()]);
  writeFileSync(target, Buffer.concat([MAGIC, iv, cipher.getAuthTag(), enc]), { mode: 0o600 });
  rmSync(tmp, { force: true });
  console.log(`Záloha: ${target} (${(enc.length / 1024 / 1024).toFixed(1)} MB)`);
} else if (mode === 'restore') {
  const [source, target] = args;
  if (!source || !target) throw new Error('Použití: restore <záloha.yyb> <cílová.db>');
  if (existsSync(target)) throw new Error(`${target} už existuje – obnova nic nepřepisuje.`);
  const raw = readFileSync(source);
  if (!raw.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Tohle není záloha YesYes.');
  const iv = raw.subarray(MAGIC.length, MAGIC.length + 12);
  const tag = raw.subarray(MAGIC.length + 12, MAGIC.length + 28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  writeFileSync(target, Buffer.concat([decipher.update(raw.subarray(MAGIC.length + 28)), decipher.final()]), { mode: 0o600 });
  console.log(`Obnoveno do ${target}.`);
} else {
  throw new Error('Použití: backup.mjs backup [soubor] | restore <záloha> <cíl>');
}
