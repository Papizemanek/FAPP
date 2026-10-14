import { DatabaseSync } from 'node:sqlite';

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

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  push_token TEXT,
  created_at TEXT NOT NULL
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

export function openDb(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
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
