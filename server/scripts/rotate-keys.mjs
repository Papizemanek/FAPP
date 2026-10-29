// Rotace šifrovacího klíče dat:
//   1. vygeneruj nový klíč: openssl rand -base64 32
//   2. nastav DATA_KEYS="v2:<nový>,v1:<starý>" (první = aktuální) a restartuj server – nové zápisy jdou novým klíčem
//   3. spusť: npm run keys:rotate -w server   (přešifruje stará data)
//   4. odeber starý klíč: DATA_KEYS="v2:<nový>"
import { loadConfig } from '../src/config.js';
import { createSealer } from '../src/crypto.js';
import { enableSealing, openDb, rotateKeys } from '../src/db.js';

const config = loadConfig();
const db = enableSealing(openDb(config.dbFile), createSealer(config.dataKey), { emailIndexKey: config.emailIndexKey });
console.log(`Přešifrováno hodnot: ${rotateKeys(db)} (aktuální klíč v${db.sealer.current}).`);
