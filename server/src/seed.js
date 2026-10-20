// Demo data pro vývoj: ověřené profily v Praze. Heslo všech: demo-heslo-123, PIN 1234, nouzový PIN 9999.
// Demo profily (e-mail @demo.yesyes) ve vývojovém režimu automaticky lajkují zpátky.
import { readFileSync } from 'node:fs';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { saveImage } from './images.js';
import { hashSecret, nowIso, snapToGrid, token } from './util.js';

const config = loadConfig();
if (!config.dev) throw new Error('Seed je jen pro vývoj.');
const db = openDb(config.dbFile);

const people = [
  ['Lucie', 'woman', ['man'], '1997-03-12', 'Ráda začínám drinkem. Pak uvidíme.', ['oneoff', 'myplace']],
  ['Klara', 'woman', ['man', 'woman'], '1992-07-01', 'Jasná domluva, žádné drama.', ['repeat', 'vanilla']],
  ['Eva', 'woman', ['man'], '2000-11-23', 'Večer po práci, ne přes den.', ['yourplace', 'kinky']],
  ['Tereza', 'woman', ['woman', 'man'], '1995-01-30', 'Nejdřív kafe, pak se uvidí.', ['oneoff', 'vanilla']],
  ['Jakub', 'man', ['woman'], '1990-05-17', 'Sportovec, nekuřák, diskrétní.', ['repeat', 'yourplace']],
  ['Martin', 'man', ['woman', 'man'], '1988-09-09', 'Pohodový, respektuju hranice.', ['oneoff', 'myplace']],
  ['Adam', 'man', ['man'], '1996-12-02', 'Hledám někoho na občasné večery.', ['repeat', 'kinky']],
  ['Sam', 'nonbinary', ['man', 'woman', 'nonbinary'], '1998-04-04', 'Otevřené, citlivé, bez spěchu.', ['oneoff', 'vanilla']],
];

const insert = db.prepare(
  `INSERT INTO users (email, password_hash, name, birthdate, gender, interested_in, bio, tags, lat, lng,
     trusted_name, trusted_phone, checkin_pin_hash, duress_pin_hash, verification_status, verified_at, person_hash, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?)`,
);

for (const [i, [name, gender, interestedIn, birthdate, bio, tags]] of people.entries()) {
  const email = `${name.toLowerCase()}@demo.yesyes`;
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) continue;
  const { lastInsertRowid } = insert.run(
    email,
    hashSecret('demo-heslo-123'),
    name === 'Klara' ? 'Klára' : name,
    birthdate,
    gender,
    JSON.stringify(interestedIn),
    bio,
    JSON.stringify(tags),
    snapToGrid(50.08 + (i - 4) * 0.012),
    snapToGrid(14.43 + ((i % 3) - 1) * 0.02),
    'Demo kontakt',
    '+420600000000',
    hashSecret('1234'),
    hashSecret('9999'),
    nowIso(),
    `demo-${token(8)}`,
    nowIso(),
  );
  const userId = Number(lastInsertRowid);
  const photo = readFileSync(new URL(`../seed/${name.toLowerCase()}.jpg`, import.meta.url)).toString('base64');
  const photoId = saveImage(db, { ownerId: userId, kind: 'profile', base64: photo });
  db.prepare('UPDATE users SET photos = ? WHERE id = ?').run(JSON.stringify([photoId]), userId);
  console.log(`+ ${email}`);
}
console.log('Hotovo. Heslo: demo-heslo-123, PIN 1234, nouzový PIN 9999.');
