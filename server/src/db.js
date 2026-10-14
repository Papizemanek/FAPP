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
  photo TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  boundaries TEXT NOT NULL DEFAULT '',
  sti_test TEXT NOT NULL DEFAULT '',
  age_min INTEGER NOT NULL DEFAULT 18,
  age_max INTEGER NOT NULL DEFAULT 99,
  max_distance_km INTEGER NOT NULL DEFAULT 50,
  lat REAL,
  lng REAL,
  trusted_name TEXT NOT NULL DEFAULT '',
  trusted_phone TEXT NOT NULL DEFAULT '',
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
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
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agreements (
  id INTEGER PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  proposed_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  meet_at TEXT NOT NULL,
  place TEXT NOT NULL,
  activities TEXT NOT NULL,
  activities_note TEXT NOT NULL DEFAULT '',
  condom INTEGER NOT NULL DEFAULT 1,
  sober INTEGER NOT NULL DEFAULT 1,
  safeword TEXT NOT NULL DEFAULT '',
  boundaries TEXT NOT NULL DEFAULT '',
  safety_required INTEGER NOT NULL DEFAULT 1,
  revoked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TEXT,
  revoke_reason TEXT NOT NULL DEFAULT '',
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS agreements_match ON agreements (match_id, id);

CREATE TABLE IF NOT EXISTS agreement_confirmations (
  agreement_id INTEGER NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  confirmed_at TEXT NOT NULL,
  PRIMARY KEY (agreement_id, user_id)
);

-- Bezpečnostní režim jednoho uživatele během schůzky. Ukládá se jen poslední poloha, žádná historie.
CREATE TABLE IF NOT EXISTS safety_sessions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  agreement_id INTEGER NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
  share_token TEXT NOT NULL UNIQUE,
  share_with_partner INTEGER NOT NULL DEFAULT 0,
  check_in_minutes INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  last_check_in_at TEXT NOT NULL,
  sos_at TEXT,
  ended_at TEXT,
  lat REAL,
  lng REAL,
  accuracy REAL,
  location_at TEXT
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
