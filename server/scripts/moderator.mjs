// Správa moderátorů (osobní účty: heslo + TOTP).
//   npm run moderator -w server -- add <e-mail> "<jméno>"     → vypíše heslo a odkaz pro autentizační aplikaci
//   npm run moderator -w server -- disable <e-mail>
//   npm run moderator -w server -- list
import { randomBytes } from 'node:crypto';
import { loadConfig } from '../src/config.js';
import { createSealer, emailIndex } from '../src/crypto.js';
import { enableSealing, openDb } from '../src/db.js';
import { createModerator } from '../src/moderators.js';
import { nowIso } from '../src/util.js';

const config = loadConfig();
const db = enableSealing(openDb(config.dbFile), createSealer(config.dataKey), { emailIndexKey: config.emailIndexKey });
const [cmd, email, name] = process.argv.slice(2);

if (cmd === 'add') {
  if (!email || !name) throw new Error('Použití: add <e-mail> "<jméno>"');
  const password = randomBytes(18).toString('base64url');
  const { otpauthUrl } = createModerator(db, { email, name, password });
  console.log(`Moderátor ${name} vytvořen.\nHeslo (ukáže se jen teď): ${password}\nTOTP – přidej do autentizační aplikace (např. jako QR kód):\n${otpauthUrl}`);
} else if (cmd === 'disable') {
  const res = db
    .prepare('UPDATE moderators SET disabled_at = ? WHERE email_hash = ?')
    .run(nowIso(), emailIndex(db.emailIndexKey, String(email).trim().toLowerCase()));
  db.prepare('DELETE FROM admin_sessions WHERE moderator_id NOT IN (SELECT id FROM moderators WHERE disabled_at IS NULL)').run();
  console.log(res.changes ? 'Zablokováno a odhlášeno.' : 'Moderátor nenalezen.');
} else if (cmd === 'list') {
  for (const m of db.prepare('SELECT id, name, email, created_at, disabled_at FROM moderators').all()) {
    console.log(`${m.id}\t${m.name}\t${m.email}\t${m.disabled_at ? 'zablokován' : 'aktivní'}`);
  }
} else {
  throw new Error('Použití: add | disable | list');
}
