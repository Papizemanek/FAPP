import { DatabaseSync } from 'node:sqlite';
import { LEGACY_TAGS, TAGS } from '../../shared/constants.js';
import { emailIndex } from './crypto.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  birthdate TEXT NOT NULL,
  gender TEXT NOT NULL,
  interested_in TEXT NOT NULL DEFAULT '[]',
  bio TEXT NOT NULL DEFAULT '',
  photos TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  age_min INTEGER NOT NULL DEFAULT 18,
  age_max INTEGER NOT NULL DEFAULT 99,
  max_distance_km INTEGER NOT NULL DEFAULT 50,
  -- poloha domova zaokrouhlená na mřížku ~1 km (ochrana proti dopočítání adresy)
  lat REAL,
  lng REAL,
  trusted_name TEXT NOT NULL DEFAULT '',
  trusted_phone TEXT NOT NULL DEFAULT '',
  checkin_pin_hash TEXT,
  duress_pin_hash TEXT,
  discreet INTEGER NOT NULL DEFAULT 0,
  verification_status TEXT NOT NULL DEFAULT 'none',
  verified_at TEXT,
  person_hash TEXT,
  document_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  status_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_person ON users (person_hash) WHERE person_hash IS NOT NULL;

-- Přihlášení (zařízení). Token se ukládá jen jako SHA-256 otisk; vyprší po neaktivitě i absolutně.
CREATE TABLE IF NOT EXISTS auth_sessions (
  id INTEGER PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'app',
  device TEXT NOT NULL DEFAULT '',
  push_token TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions (user_id);

-- Jednorázové kódy z e-mailu (registrace, obnova hesla) a druhý krok přihlášení. Jen otisky.
CREATE TABLE IF NOT EXISTS email_codes (
  id INTEGER PRIMARY KEY,
  purpose TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS email_codes_lookup ON email_codes (purpose, email_hash);

CREATE TABLE IF NOT EXISTS login_challenges (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'app',
  device TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL
);

-- Záložní kódy pro dvoufázové ověření (jen otisky, každý jde použít jednou).
CREATE TABLE IF NOT EXISTS recovery_codes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TEXT,
  PRIMARY KEY (user_id, code_hash)
);

-- Neúspěšná přihlášení podle e-mailu (otisku) – zpomalení hádání hesel i z mnoha IP adres.
CREATE TABLE IF NOT EXISTS login_throttle (
  key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  updated_at TEXT NOT NULL
);

-- Limity požadavků (pevné minutové okno). V databázi, aby platily i po restartu.
CREATE TABLE IF NOT EXISTS rate_hits (
  key TEXT NOT NULL,
  win INTEGER NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, win)
);

-- Moderátoři: osobní účty s heslem a TOTP, každý přístup se zapisuje do auditu.
CREATE TABLE IF NOT EXISTS moderators (
  id INTEGER PRIMARY KEY,
  email_hash TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  totp_secret TEXT NOT NULL,
  totp_last_step INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  disabled_at TEXT
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  moderator_id INTEGER NOT NULL REFERENCES moderators(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  moderator_id INTEGER,
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_sessions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'started',
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  decided_at TEXT
);

-- Zabanovaní lidé. Ukládá se jen HMAC z identity, ne doklad ani jméno.
CREATE TABLE IF NOT EXISTS banned_identities (
  hash TEXT PRIMARY KEY,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
  data BLOB NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS swipes (
  swiper_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  liked INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (swiper_id, target_id)
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY,
  user_a INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  ended_at TEXT,
  UNIQUE (user_a, user_b),
  CHECK (user_a < user_b)
);

-- Text zprávy je zašifrovaný (AES-256-GCM).
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  image_id TEXT REFERENCES images(id) ON DELETE SET NULL,
  warning TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_match ON messages (match_id, id);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY,
  reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reported_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  match_id INTEGER REFERENCES matches(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

-- Fronta pro moderátory: nahlášení, negativní hodnocení, podezřelé zprávy.
CREATE TABLE IF NOT EXISTS flags (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  reason TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  ref_id INTEGER,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS agreements (
  id INTEGER PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  proposed_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  meet_at TEXT NOT NULL,
  place TEXT NOT NULL,
  activities TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  condom INTEGER NOT NULL DEFAULT 1,
  sober INTEGER NOT NULL DEFAULT 1,
  safeword TEXT NOT NULL DEFAULT '',
  ever_confirmed_at TEXT,
  revoked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS agreements_match ON agreements (match_id, id);

-- Přání každého zvlášť (ano/možná/ne + vlastní hranice), zašifrovaná. Druhý nikdy nevidí cizí „ne“, jen shodu.
CREATE TABLE IF NOT EXISTS agreement_wishes (
  agreement_id INTEGER NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wishes TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (agreement_id, user_id)
);

CREATE TABLE IF NOT EXISTS agreement_confirmations (
  agreement_id INTEGER NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  consent_text_version INTEGER NOT NULL,
  confirmed_at TEXT NOT NULL,
  PRIMARY KEY (agreement_id, user_id)
);

-- Hodnocení po schůzce. Protějšek ho nikdy nevidí.
CREATE TABLE IF NOT EXISTS feedback (
  agreement_id INTEGER NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  about_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ok INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  PRIMARY KEY (agreement_id, author_id)
);

-- Bezpečnostní režim jednoho uživatele během schůzky. Ukládá se jen poslední poloha.
CREATE TABLE IF NOT EXISTS safety_sessions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Match a dohoda můžou zmizet (protějšek smaže účet), bezpečnostní režim musí běžet dál.
  -- Proto SET NULL a kopie údajů o schůzce a protějšku přímo tady.
  match_id INTEGER REFERENCES matches(id) ON DELETE SET NULL,
  agreement_id INTEGER REFERENCES agreements(id) ON DELETE SET NULL,
  partner_name TEXT NOT NULL,
  partner_age INTEGER NOT NULL,
  partner_photo BLOB,
  meet_at TEXT NOT NULL,
  place TEXT NOT NULL,
  share_token TEXT NOT NULL UNIQUE,
  trusted_name TEXT NOT NULL,
  trusted_phone TEXT NOT NULL,
  check_in_minutes INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  last_check_in_at TEXT NOT NULL,
  sos_at TEXT,
  silent_alarm_at TEXT,
  silent_alarm_reason TEXT NOT NULL DEFAULT '',
  wrong_pin_count INTEGER NOT NULL DEFAULT 0,
  overdue_alerted_at TEXT,
  ended_at TEXT,
  -- 'ok' = ukončeno běžným PINem, 'duress' = nouzovým PINem (pro telefon vypadá stejně)
  end_kind TEXT NOT NULL DEFAULT '',
  lat REAL,
  lng REAL,
  accuracy REAL,
  battery REAL,
  location_at TEXT
);
CREATE INDEX IF NOT EXISTS safety_active ON safety_sessions (ended_at);

-- Předplatné. Zdroj pravdy jsou obchody (přes RevenueCat), 'dev' a 'admin' jsou pro vývoj a testery.
-- Aktuální úroveň je kvůli rychlému swipování zkopírovaná i v users.plan / users.plan_expires_at.
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  product_id TEXT NOT NULL,
  source TEXT NOT NULL,
  original_transaction_id TEXT,
  expires_at TEXT NOT NULL,
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_tx ON subscriptions (original_transaction_id)
  WHERE original_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS subscriptions_user ON subscriptions (user_id, expires_at);

-- Jednorázové nákupy (boost, super lajky, Dnes večer). transaction_id hlídá, ať se nic nepřipíše dvakrát.
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  source TEXT NOT NULL,
  transaction_id TEXT UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credits (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, kind)
);

-- Spuštěné boosty – kvůli měsíčnímu boostu v Gold a Platinum.
CREATE TABLE IF NOT EXISTS boosts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_plan INTEGER NOT NULL,
  started_at TEXT NOT NULL
);

-- Čekací listina z webu. E-mail zašifrovaný, duplicity podle HMAC otisku.
CREATE TABLE IF NOT EXISTS waitlist (
  id INTEGER PRIMARY KEY,
  email_hash TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'other',
  locale TEXT NOT NULL DEFAULT 'cs',
  created_at TEXT NOT NULL
);

-- Fronta SMS pro důvěryhodné osoby. Hlídač ji opakovaně odesílá, dokud zprávy neprojdou.
CREATE TABLE IF NOT EXISTS sms_outbox (
  id INTEGER PRIMARY KEY,
  safety_session_id INTEGER REFERENCES safety_sessions(id) ON DELETE SET NULL,
  to_phone TEXT NOT NULL,
  body TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  sent_at TEXT
);
`;

// Sloupce přidané po prvním spuštění – existující databáze je dostanou při startu.
const MIGRATIONS = [
  ['agreements', 'public_first', 'INTEGER NOT NULL DEFAULT 0'],
  ['agreements', 'was_confirmed', 'INTEGER NOT NULL DEFAULT 0'],
  ['agreements', 'preserved_at', 'TEXT'],
  ['agreements', 'redacted_at', 'TEXT'],
  ['safety_sessions', 'partner_id', 'INTEGER'],
  ['safety_sessions', 'preserved', 'INTEGER NOT NULL DEFAULT 0'],
  ['flags', 'by_user_id', 'INTEGER'],
  ['users', 'plan', "TEXT NOT NULL DEFAULT 'free'"],
  ['users', 'plan_expires_at', 'TEXT'],
  ['users', 'incognito', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'travel_city', 'TEXT'],
  ['users', 'boost_until', 'TEXT'],
  ['users', 'tonight_until', 'TEXT'],
  // super = 1 u super lajku; super_credit = 1, když se zaplatil kreditem (ne týdenní dávkou z předplatného)
  ['swipes', 'super', 'INTEGER NOT NULL DEFAULT 0'],
  ['swipes', 'super_credit', 'INTEGER NOT NULL DEFAULT 0'],
  // Jazyk SMS pro důvěryhodnou osobu a push notifikací (kód z shared/i18n LOCALES).
  ['users', 'locale', "TEXT NOT NULL DEFAULT 'cs'"],
  // Jazyk SMS jedné schůzky – zafixuje se při startu, ať všechny SMS k jedné schůzce chodí stejně.
  // Starší schůzky (NULL) používají jazyk uživatele.
  ['safety_sessions', 'locale', 'TEXT'],
  // Bezpečnost účtu: slepý index e-mailu, dvoufázové ověření, čas změny hesla.
  ['users', 'email_hash', 'TEXT'],
  ['users', 'totp_secret', 'TEXT'],
  ['users', 'totp_enabled', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'totp_last_step', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'password_changed_at', 'TEXT'],
];

function migrate(db) {
  for (const [table, column, definition] of MIGRATIONS) {
    const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
    if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  migrateTags(db);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_email_hash ON users (email_hash) WHERE email_hash IS NOT NULL');
  // Staré přihlašovací tokeny byly uložené čitelně – zahodit, každý se přihlásí znovu.
  db.exec('DROP TABLE IF EXISTS sessions');
}

// Štítky z doby před „Moje ano*“ → nové (U mě → host, Vanilka → classic…); neznámé zahodí.
function migrateTags(db) {
  const legacy = Object.keys(LEGACY_TAGS);
  const rows = db
    .prepare(`SELECT id, tags FROM users WHERE ${legacy.map(() => 'tags LIKE ?').join(' OR ')}`)
    .all(...legacy.map((tag) => `%"${tag}"%`));
  const update = db.prepare('UPDATE users SET tags = ? WHERE id = ?');
  for (const { id, tags } of rows) {
    const next = [...new Set(JSON.parse(tags).map((tag) => LEGACY_TAGS[tag] ?? tag))].filter((tag) => tag in TAGS);
    update.run(JSON.stringify(next), id);
  }
}

// Sloupce šifrované v klidu (AES-256-GCM, crypto.js). Seznam slouží k zašifrování starších dat
// při startu a ke skriptu na rotaci klíčů. Zapisuje se přes db.seal(), čte se automaticky (enableSealing).
export const SEALED_COLUMNS = {
  users: ['email', 'name', 'birthdate', 'gender', 'interested_in', 'bio', 'tags', 'lat', 'lng', 'trusted_name', 'trusted_phone', 'totp_secret'],
  safety_sessions: ['partner_name', 'partner_photo', 'place', 'trusted_name', 'trusted_phone', 'lat', 'lng'],
  sms_outbox: ['to_phone', 'body'],
  agreements: ['place', 'safeword'],
  agreement_wishes: ['wishes', 'note'],
  messages: ['body'],
  reports: ['details'],
  feedback: ['details'],
  waitlist: ['email'],
  images: ['data'],
  email_codes: ['payload'],
  moderators: ['email', 'totp_secret'],
};

/**
 * Zapne šifrování v klidu: výsledky všech dotazů se automaticky dešifrují (kód pracuje s čistými hodnotami)
 * a db.seal(value) / db.sealBytes(buf) šifrují při zápisu. Starší nezašifrovaná data se zašifrují hned.
 */
export function enableSealing(db, sealer, { emailIndexKey } = {}) {
  if (db.sealer) return db;
  const prepare = db.prepare.bind(db);
  const openRow = (row) => {
    if (!row) return row;
    for (const key of Object.keys(row)) {
      const v = row[key];
      if (typeof v === 'string' ? v.charCodeAt(0) === 118 /* v */ : v instanceof Uint8Array) row[key] = sealer.tryOpen(v);
    }
    return row;
  };
  db.prepare = (sql) => {
    const stmt = prepare(sql);
    return {
      run: (...args) => stmt.run(...args),
      get: (...args) => openRow(stmt.get(...args)),
      all: (...args) => stmt.all(...args).map(openRow),
      raw: stmt,
    };
  };
  db.sealer = sealer;
  db.seal = (value) => sealer.seal(value);
  db.sealBytes = (buf) => sealer.sealBytes(buf);
  db.emailIndexKey = emailIndexKey;
  encryptAtRest(db, prepare);
  return db;
}

/** Zašifruje vše, co ještě zašifrované není (data z doby před šifrováním v klidu). */
function encryptAtRest(db, prepare) {
  const { sealer } = db;
  // Slepý index e-mailu se musí spočítat z čistého e-mailu, tedy dřív, než se e-mail zašifruje.
  if (db.emailIndexKey) {
    const rows = prepare("SELECT id, email FROM users WHERE email_hash IS NULL OR email_hash = ''").all();
    const update = prepare('UPDATE users SET email_hash = ? WHERE id = ?');
    for (const { id, email } of rows) update.run(emailIndex(db.emailIndexKey, sealer.openText(email)), id);
  }
  for (const [table, columns] of Object.entries(SEALED_COLUMNS)) {
    for (const column of columns) {
      const rows = prepare(
        `SELECT rowid AS rid, ${column} AS v FROM ${table}
         WHERE ${column} IS NOT NULL AND ${column} != ''
           AND NOT (typeof(${column}) = 'text' AND ${column} GLOB 'v[0-9]*:*')
           AND NOT (typeof(${column}) = 'blob' AND substr(${column}, 1, 3) = CAST('YYE' AS BLOB))`,
      ).all();
      const update = prepare(`UPDATE ${table} SET ${column} = ? WHERE rowid = ?`);
      for (const { rid, v } of rows) {
        if (sealer.isSealed(v)) continue;
        update.run(v instanceof Uint8Array ? sealer.sealBytes(v) : sealer.seal(v), rid);
      }
    }
  }
}

/**
 * Přešifruje všechny šifrované hodnoty aktuálním klíčem z keyringu (po přidání nového klíče).
 * Vrací počet přešifrovaných hodnot. Pak jde starý klíč z DATA_KEYS vyřadit.
 */
export function rotateKeys(db) {
  const { sealer } = db;
  let count = 0;
  for (const [table, columns] of Object.entries(SEALED_COLUMNS)) {
    for (const column of columns) {
      const select = db.prepare(`SELECT rowid AS rid, ${column} AS v FROM ${table} WHERE ${column} IS NOT NULL AND ${column} != ''`).raw;
      const update = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE rowid = ?`);
      for (const { rid, v } of select.all()) {
        const version = sealer.versionOf(v);
        if (version === sealer.current) continue;
        const plain = v instanceof Uint8Array ? sealer.openBytes(v) : sealer.open(v);
        update.run(v instanceof Uint8Array ? sealer.sealBytes(plain) : sealer.seal(plain), rid);
        count += 1;
      }
    }
  }
  return count;
}

export function openDb(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
