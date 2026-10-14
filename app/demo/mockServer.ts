// Simulovaný backend pro webový prototyp. Napodobuje chování server/ (stejné odpovědi, stejná pravidla
// souhlasu a bezpečnostního režimu), jen běží v prohlížeči nad daty v localStorage.
// Moderace zpráv je převzatá přímo ze serveru. Demo protějšky lajkují zpátky, odpovídají a potvrzují dohody.

import { ACTIVITIES, CHECK_IN_GRACE_MINUTES, CHECK_IN_OPTIONS, MIN_AGE, WRONG_PIN_ALARM_THRESHOLD } from '@fapp/shared';
import { moderate } from '../../server/src/services/moderation.js';
import { overlay } from './overlay';

type Gender = 'man' | 'woman' | 'nonbinary';

type User = {
  id: number;
  email: string;
  password: string;
  name: string;
  birthdate: string;
  gender: Gender;
  interestedIn: Gender[];
  bio: string;
  photos: { id: string; url: string }[];
  tags: string[];
  ageMin: number;
  ageMax: number;
  maxDistanceKm: number;
  lat: number | null;
  lng: number | null;
  trustedName: string;
  trustedPhone: string;
  checkinPin: string | null;
  duressPin: string | null;
  discreet: boolean;
  verificationStatus: 'none' | 'pending' | 'approved' | 'declined';
  status: 'active' | 'suspended' | 'banned';
  demo: boolean;
};

type Match = { id: number; a: number; b: number; createdAt: string; endedAt: string | null; partnerSafety: boolean; script: number };
type Message = { id: number; matchId: number; senderId: number; text: string; imageUrl: string | null; warning: string; createdAt: string };
type Agreement = {
  id: number;
  matchId: number;
  version: number;
  proposedBy: number;
  meetAt: string;
  place: string;
  activities: string[];
  note: string;
  condom: boolean;
  sober: boolean;
  safeword: string;
  confirmations: Record<number, number>;
  everConfirmedAt: string | null;
  revokedBy: number | null;
  revokedAt: string | null;
  updatedAt: string;
};
type Safety = {
  id: number;
  userId: number;
  matchId: number;
  agreementId: number;
  partnerName: string;
  partnerAge: number;
  meetAt: string;
  place: string;
  trustedName: string;
  trustedPhone: string;
  checkInMinutes: number;
  startedAt: string;
  lastCheckInAt: string;
  sosAt: string | null;
  silentAlarmAt: string | null;
  wrongPins: number;
  overdueAlertedAt: string | null;
  endedAt: string | null;
  endKind: '' | 'ok' | 'duress';
  lat: number | null;
  lng: number | null;
  battery: number | null;
  locationAt: string | null;
};

type Db = {
  nextId: number;
  users: User[];
  tokens: Record<string, number>;
  swipes: { from: number; to: number; like: boolean }[];
  matches: Match[];
  messages: Message[];
  agreements: Agreement[];
  safety: Safety[];
  feedback: { agreementId: number; authorId: number }[];
  blocks: { a: number; b: number }[];
};

type Res = { status: number; json: unknown };

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const STORAGE_KEY = 'fapp-demo-db-v1';
const nowIso = () => new Date().toISOString();

// --- demo data ---

const TONES = ['#3B2A35', '#2B3340', '#3A3328', '#2E3A33', '#33293D', '#283640', '#3D2E2A', '#2F2F3D'];

function photo(name: string, i: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="960" viewBox="0 0 720 960"><rect width="720" height="960" fill="${TONES[i % TONES.length]}"/><circle cx="360" cy="380" r="150" fill="rgba(245,239,233,0.08)"/><text x="360" y="380" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="220" fill="#F5EFE9" text-anchor="middle" dominant-baseline="central">${name[0]}</text><text x="360" y="600" font-family="Helvetica, Arial, sans-serif" font-size="30" fill="rgba(245,239,233,0.55)" text-anchor="middle">ukázkový profil</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const DEMO_PEOPLE: [string, Gender, Gender[], string, string, string[]][] = [
  ['Lucie', 'woman', ['man'], '1997-03-12', 'Ráda začínám drinkem. Pak uvidíme.', ['oneoff', 'myplace']],
  ['Klára', 'woman', ['man', 'woman'], '1992-07-01', 'Jasná domluva, žádné drama.', ['repeat', 'vanilla']],
  ['Eva', 'woman', ['man'], '2000-11-23', 'Večer po práci, ne přes den.', ['yourplace', 'kinky']],
  ['Tereza', 'woman', ['woman', 'man'], '1995-01-30', 'Nejdřív kafe, pak se uvidí.', ['oneoff', 'vanilla']],
  ['Barbora', 'woman', ['man', 'nonbinary'], '1990-09-14', 'Diskrétní, upřímná, nekuřačka.', ['repeat', 'myplace']],
  ['Nikola', 'woman', ['woman'], '1998-05-02', 'Hledám holku na občasné večery.', ['repeat', 'yourplace']],
  ['Jakub', 'man', ['woman'], '1990-05-17', 'Sportovec, nekuřák, diskrétní.', ['repeat', 'yourplace']],
  ['Martin', 'man', ['woman', 'man'], '1988-09-09', 'Pohodový, respektuju hranice.', ['oneoff', 'myplace']],
  ['Tomáš', 'man', ['woman'], '1994-02-21', 'Vařím, běhám, rád se nechám překvapit.', ['oneoff', 'vanilla']],
  ['Ondřej', 'man', ['woman', 'nonbinary'], '1986-12-11', 'Klidný, čistý, testovaný.', ['repeat', 'myplace']],
  ['Filip', 'man', ['woman'], '1999-08-08', 'Spontánní, ale vždycky s domluvou.', ['oneoff', 'yourplace']],
  ['David', 'man', ['woman', 'man'], '1992-04-27', 'Přes den práce, večer volno.', ['repeat', 'kinky']],
  ['Adam', 'man', ['man'], '1996-12-02', 'Hledám někoho na občasné večery.', ['repeat', 'kinky']],
  ['Sam', 'nonbinary', ['man', 'woman', 'nonbinary'], '1998-04-04', 'Otevřené, citlivé, bez spěchu.', ['oneoff', 'vanilla']],
];

const ASCII = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function seed(): Db {
  const users: User[] = DEMO_PEOPLE.map(([name, gender, interestedIn, birthdate, bio, tags], i) => ({
    id: i + 1,
    email: `${ASCII(name)}@demo.fapp`,
    password: 'demo-heslo-123',
    name,
    birthdate,
    gender,
    interestedIn,
    bio,
    photos: [{ id: `p${i + 1}`, url: photo(name, i) }],
    tags,
    ageMin: 18,
    ageMax: 60,
    maxDistanceKm: 50,
    lat: Math.round((50.08 + ((i % 5) - 2) * 0.012) * 100) / 100,
    lng: Math.round((14.43 + ((i % 3) - 1) * 0.02) * 100) / 100,
    trustedName: 'Petra',
    trustedPhone: '+420777000111',
    checkinPin: '1234',
    duressPin: '9999',
    discreet: false,
    verificationStatus: 'approved',
    status: 'active',
    demo: true,
  }));
  return { nextId: 1000, users, tokens: {}, swipes: [], matches: [], messages: [], agreements: [], safety: [], feedback: [], blocks: [] };
}

function load(): Db {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // prohlížeč bez úložiště – začneme od nuly
  }
  return seed();
}

let db = load();
const save = () => {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // plné nebo zakázané úložiště – data zůstanou jen do zavření stránky
  }
};
const id = () => ++db.nextId;

export function resetDemo() {
  db = seed();
  save();
}

// --- pomocné funkce ---

function ageFrom(birthdate: string) {
  const [y, m, d] = birthdate.split('-').map(Number);
  const t = new Date();
  let age = t.getFullYear() - y;
  if (t.getMonth() + 1 < m || (t.getMonth() + 1 === m && t.getDate() < d)) age -= 1;
  return age;
}

function km(a: User, b: User) {
  if (a.lat == null || b.lat == null || a.lng == null || b.lng == null) return null;
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const userById = (uid: number) => db.users.find((u) => u.id === uid);
const blocked = (a: number, b: number) => db.blocks.some((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));

function publicProfile(u: User, viewer: User | null) {
  const d = viewer ? km(viewer, u) : null;
  return {
    id: u.id,
    name: u.name,
    age: ageFrom(u.birthdate),
    gender: u.gender,
    bio: u.bio,
    photos: u.photos.map((p) => p.url),
    tags: u.tags,
    verified: u.verificationStatus === 'approved',
    distanceKm: d == null ? null : Math.max(1, Math.round(d)),
  };
}

function own(u: User) {
  return {
    ...publicProfile(u, null),
    photoIds: u.photos.map((p) => p.id),
    email: u.email,
    birthdate: u.birthdate,
    interestedIn: u.interestedIn,
    ageMin: u.ageMin,
    ageMax: u.ageMax,
    maxDistanceKm: u.maxDistanceKm,
    hasLocation: u.lat != null,
    trustedName: u.trustedName,
    trustedPhone: u.trustedPhone,
    hasCheckinPin: !!u.checkinPin,
    hasDuressPin: !!u.duressPin,
    discreet: u.discreet,
    verificationStatus: u.verificationStatus,
    status: u.status,
  };
}

function matchFor(matchId: number, uid: number, allowEnded = false) {
  const m = db.matches.find((x) => x.id === matchId);
  if (!m || (m.a !== uid && m.b !== uid)) throw new HttpError(404, 'Match neexistuje.');
  if (m.endedAt && !allowEnded) throw new HttpError(410, 'Tenhle match už skončil.');
  const other = userById(m.a === uid ? m.b : m.a)!;
  return { m, other };
}

const currentAgreement = (matchId: number) =>
  db.agreements.filter((a) => a.matchId === matchId).sort((x, y) => y.id - x.id)[0] ?? null;

function fullyConfirmed(a: Agreement, m: Match) {
  return a.confirmations[m.a] === a.version && a.confirmations[m.b] === a.version;
}

function agreementStatus(a: Agreement, m: Match) {
  if (a.revokedAt) return 'revoked';
  const confirmed = fullyConfirmed(a, m);
  if (Date.parse(a.meetAt) + 12 * 3600_000 < Date.now()) return confirmed ? 'past' : 'expired';
  return confirmed ? 'confirmed' : 'pending';
}

function agreementView(a: Agreement | null, m: Match, uid: number) {
  if (!a) return null;
  const other = m.a === uid ? m.b : m.a;
  return {
    id: a.id,
    version: a.version,
    status: agreementStatus(a, m),
    proposedByMe: a.proposedBy === uid,
    meetAt: a.meetAt,
    place: a.place,
    activities: a.activities,
    note: a.note,
    condom: a.condom,
    sober: a.sober,
    safeword: a.safeword,
    confirmedByMe: a.confirmations[uid] === a.version ? a.updatedAt : null,
    confirmedByPartner: a.confirmations[other] === a.version ? a.updatedAt : null,
    revokedByMe: a.revokedAt ? a.revokedBy === uid : null,
    revokedAt: a.revokedAt,
    updatedAt: a.updatedAt,
  };
}

const due = (s: Safety) => Date.parse(s.lastCheckInAt) + s.checkInMinutes * 60_000;
const overdue = (s: Safety) => !s.endedAt && Date.now() > due(s) + CHECK_IN_GRACE_MINUTES * 60_000;

function ownStatus(s: Safety) {
  if (s.endedAt) return 'ended';
  if (s.sosAt) return 'sos';
  if (overdue(s)) return 'overdue';
  return 'ok';
}

function shareStatus(s: Safety) {
  if (s.endedAt && s.endKind === 'ok') return 'ended';
  if (s.sosAt || s.silentAlarmAt) return 'alarm';
  if (s.endedAt) return 'ended';
  if (overdue(s)) return 'overdue';
  return 'ok';
}

const shareUrl = (s: Safety) => `https://fapp.example/s/${s.id}`;

function safetyView(s: Safety) {
  return {
    id: s.id,
    status: ownStatus(s),
    shareUrl: shareUrl(s),
    trustedName: s.trustedName,
    checkInMinutes: s.checkInMinutes,
    startedAt: s.startedAt,
    lastCheckInAt: s.lastCheckInAt,
    nextCheckInDue: new Date(due(s)).toISOString(),
    sosAt: s.sosAt,
    endedAt: s.endedAt,
    matchId: s.matchId,
    meetAt: s.meetAt,
    place: s.place,
    partner: { name: s.partnerName, age: s.partnerAge },
  };
}

/** Co vidí důvěryhodná osoba – pro ukázku v demo panelu. */
export function shareView(sessionId: number) {
  const s = db.safety.find((x) => x.id === sessionId);
  if (!s) return null;
  const status = shareStatus(s);
  const name = userById(s.userId)?.name ?? '';
  if (status === 'ended') return { status, name, endedAt: s.endedAt, hadAlarm: !!(s.sosAt || s.silentAlarmAt) };
  return {
    status,
    name,
    lastCheckInAt: s.lastCheckInAt,
    nextCheckInDue: new Date(due(s)).toISOString(),
    alarmAt: s.sosAt ?? s.silentAlarmAt,
    meetAt: s.meetAt,
    place: s.place,
    partner: { name: s.partnerName, age: s.partnerAge },
    location: s.lat != null ? { lat: s.lat, lng: s.lng, battery: s.battery, at: s.locationAt } : null,
  };
}

export const latestSafetyId = () => [...db.safety].sort((a, b) => b.id - a.id)[0]?.id ?? null;

/** Demo: posune čas u probíhajících schůzek, aby šlo vyzkoušet zmeškaný check-in. */
export function skipTime(minutes: number) {
  for (const s of db.safety) {
    if (s.endedAt) continue;
    s.lastCheckInAt = new Date(Date.parse(s.lastCheckInAt) - minutes * 60_000).toISOString();
    s.startedAt = new Date(Date.parse(s.startedAt) - minutes * 60_000).toISOString();
  }
  save();
  watchdog();
}

function sms(s: Safety, text: string) {
  overlay.sms({ to: s.trustedName, phone: s.trustedPhone, text, sessionId: s.id });
}

const userName = (s: Safety) => userById(s.userId)?.name ?? 'Tvůj blízký člověk';
const time = (iso: string) => new Date(iso).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });

// Hlídač check-inů – na serveru běží každých 30 s, tady při každém požadavku a každých 5 s.
function watchdog() {
  let changed = false;
  for (const s of db.safety) {
    if (s.endedAt || s.overdueAlertedAt || !overdue(s)) continue;
    s.overdueAlertedAt = nowIso();
    changed = true;
    if (s.sosAt || s.silentAlarmAt) continue;
    sms(s, `${userName(s)} se neozval/a – potvrzení, že je v pořádku, mělo přijít do ${time(new Date(due(s)).toISOString())}. Zkus zavolat. Poloha: ${shareUrl(s)}`);
  }
  // simulovaná poloha telefonu během schůzky
  for (const s of db.safety) {
    if (s.endedAt) continue;
    s.lat = 50.0755 + Math.sin(Date.now() / 600_000) * 0.0004;
    s.lng = 14.4378 + Math.cos(Date.now() / 600_000) * 0.0004;
    s.battery = 0.72;
    s.locationAt = nowIso();
    changed = true;
  }
  if (changed) save();
}
setInterval(watchdog, 5000);

function raiseSilentAlarm(s: Safety) {
  if (s.silentAlarmAt || s.sosAt) return;
  s.silentAlarmAt = nowIso();
  sms(s, `POPLACH: ${userName(s)} potřebuje pomoc. Poloha a podrobnosti: ${shareUrl(s)}`);
}

function checkPin(user: User, s: Safety, pin: unknown): 'ok' | 'duress' | 'wrong' {
  if (pin === user.duressPin) return 'duress';
  if (pin === user.checkinPin) return 'ok';
  s.wrongPins += 1;
  if (s.wrongPins >= WRONG_PIN_ALARM_THRESHOLD) raiseSilentAlarm(s);
  save();
  return 'wrong';
}

// --- demo protějšky ---

const REPLIES = [
  'Ahoj! Taky mě to láká.',
  'Klidně dnes nebo zítra večer. Pošli mi návrh dohody, ať víme, na čem jsme.',
  'Dobře, mám to.',
  'Těším se.',
];

function later(ms: number, fn: () => void) {
  setTimeout(() => {
    fn();
    save();
  }, ms);
}

function demoSay(m: Match, senderId: number, text: string) {
  db.messages.push({ id: id(), matchId: m.id, senderId, text, imageUrl: null, warning: '', createdAt: nowIso() });
}

function demoReply(m: Match, partner: User) {
  if (!partner.demo || m.endedAt) return;
  const a = currentAgreement(m.id);
  const text = a && agreementStatus(a, m) === 'confirmed' ? 'Uvidíme se. Dej vědět, až vyrazíš.' : REPLIES[Math.min(m.script, REPLIES.length - 1)];
  m.script += 1;
  later(2200, () => demoSay(m, partner.id, text));
}

function demoConfirm(m: Match, partner: User, agreementId: number) {
  if (!partner.demo) return;
  later(2500, () => {
    const a = db.agreements.find((x) => x.id === agreementId);
    if (!a || a.revokedAt) return;
    a.confirmations[partner.id] = a.version;
    if (fullyConfirmed(a, m) && !a.everConfirmedAt) a.everConfirmedAt = nowIso();
    demoSay(m, partner.id, 'Přečetl/a jsem si dohodu a potvrdil/a ji.');
  });
}

// --- router ---

type Ctx = { method: string; path: string; body: Record<string, unknown>; user: User | null; token: string | null };
type Handler = (c: Ctx, params: string[]) => unknown;

const routes: [string, RegExp, Handler][] = [];
const route = (method: string, pattern: string, handler: Handler) =>
  routes.push([method, new RegExp(`^${pattern.replace(/:\w+/g, '([^/]+)')}$`), handler]);

function requireUser(c: Ctx, { allowSuspended = false } = {}) {
  if (!c.user) throw new HttpError(401, 'Nejsi přihlášený/á.');
  if (c.user.status === 'suspended' && !allowSuspended) throw new HttpError(403, 'Účet je pozastavený do kontroly moderátorem.');
  return c.user;
}
function requireVerified(c: Ctx) {
  const u = requireUser(c);
  if (u.verificationStatus !== 'approved') throw new HttpError(403, 'Nejdřív si ověř totožnost.');
  return u;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const token = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

function normalizePhone(raw: string) {
  const r = raw.replace(/[\s()-]/g, '');
  const n = r.startsWith('+') ? r : r.startsWith('00') ? `+${r.slice(2)}` : `+420${r}`;
  if (!/^\+[1-9]\d{7,14}$/.test(n)) throw new HttpError(400, 'Neplatné telefonní číslo (telefon důvěryhodné osoby).');
  return n;
}

// auth
route('POST', '/auth/register', (c) => {
  const b = c.body;
  const email = str(b.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Neplatný e-mail.');
  if (str(b.password).length < 10) throw new HttpError(400, 'Pole heslo je příliš krátké.');
  if (str(b.name).length < 2) throw new HttpError(400, 'Pole jméno je příliš krátké.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str(b.birthdate))) throw new HttpError(400, 'Neplatné datum narození.');
  if (b.confirmAdult !== true) throw new HttpError(400, 'Musíš potvrdit, že je ti 18 let nebo víc.');
  if (b.acceptRules !== true) throw new HttpError(400, 'Musíš souhlasit s pravidly a se zpracováním údajů.');
  if (ageFrom(str(b.birthdate)) < MIN_AGE) throw new HttpError(403, 'F*app je jen pro lidi starší 18 let.');
  if (db.users.some((u) => u.email === email)) throw new HttpError(409, 'Účet s tímhle e-mailem už existuje.');
  const user: User = {
    id: id(),
    email,
    password: str(b.password),
    name: str(b.name),
    birthdate: str(b.birthdate),
    gender: b.gender as Gender,
    interestedIn: (b.interestedIn as Gender[]) ?? [],
    bio: '',
    photos: [],
    tags: [],
    ageMin: 18,
    ageMax: 99,
    maxDistanceKm: 50,
    lat: 50.08,
    lng: 14.42,
    trustedName: '',
    trustedPhone: '',
    checkinPin: null,
    duressPin: null,
    discreet: false,
    verificationStatus: 'none',
    status: 'active',
    demo: false,
  };
  db.users.push(user);
  const t = token();
  db.tokens[t] = user.id;
  return { status: 201, json: { token: t, user: own(user) } };
});

route('POST', '/auth/login', (c) => {
  const u = db.users.find((x) => x.email === str(c.body.email).toLowerCase());
  if (!u || u.password !== c.body.password) throw new HttpError(401, 'Špatný e-mail nebo heslo.');
  const t = token();
  db.tokens[t] = u.id;
  return { token: t, user: own(u) };
});
route('POST', '/auth/logout', (c) => {
  if (c.token) delete db.tokens[c.token];
  return null;
});
route('PUT', '/auth/push-token', () => null);

// profil
route('GET', '/me', (c) => own(requireUser(c, { allowSuspended: true })));
route('PUT', '/me', (c) => {
  const u = requireUser(c, { allowSuspended: true });
  const b = c.body;
  const verdict = moderate(str(b.bio));
  if (verdict.action === 'block') throw new HttpError(400, verdict.message ?? 'Text porušuje pravidla.');
  if (Number(b.ageMin) > Number(b.ageMax)) throw new HttpError(400, 'Věk od musí být menší než věk do.');
  Object.assign(u, {
    name: str(b.name) || u.name,
    bio: str(b.bio),
    interestedIn: b.interestedIn,
    tags: b.tags,
    ageMin: Number(b.ageMin),
    ageMax: Number(b.ageMax),
    maxDistanceKm: Number(b.maxDistanceKm),
  });
  return own(u);
});
route('PUT', '/me/location', (c) => {
  const u = requireUser(c, { allowSuspended: true });
  u.lat = Math.round(Number(c.body.lat) * 100) / 100;
  u.lng = Math.round(Number(c.body.lng) * 100) / 100;
  return own(u);
});
route('POST', '/me/photos', (c) => {
  const u = requireUser(c, { allowSuspended: true });
  if (u.photos.length >= 3) throw new HttpError(400, 'Maximálně 3 fotky.');
  u.photos.push({ id: token(), url: `data:image/jpeg;base64,${str(c.body.jpegBase64)}` });
  return { status: 201, json: own(u) };
});
route('DELETE', '/me/photos/:id', (c, [pid]) => {
  const u = requireUser(c, { allowSuspended: true });
  u.photos = u.photos.filter((p) => p.id !== pid);
  return own(u);
});
route('PUT', '/me/safety', (c) => {
  const u = requireUser(c, { allowSuspended: true });
  const b = c.body;
  if (str(b.trustedName).length < 2) throw new HttpError(400, 'Pole jméno důvěryhodné osoby je příliš krátké.');
  const phone = normalizePhone(str(b.trustedPhone));
  if (b.checkinPin !== undefined || b.duressPin !== undefined) {
    if (u.checkinPin && b.password !== u.password) throw new HttpError(403, 'Špatné heslo.');
    const pin = str(b.checkinPin);
    const duress = str(b.duressPin);
    if (!/^\d{4,6}$/.test(pin)) throw new HttpError(400, 'PIN musí mít 4–6 číslic.');
    if (!/^\d{4,6}$/.test(duress)) throw new HttpError(400, 'Nouzový PIN musí mít 4–6 číslic.');
    if (pin === duress) throw new HttpError(400, 'Nouzový PIN musí být jiný než běžný PIN.');
    u.checkinPin = pin;
    u.duressPin = duress;
  }
  u.trustedName = str(b.trustedName);
  u.trustedPhone = phone;
  u.discreet = b.discreet === true;
  return own(u);
});
route('DELETE', '/me', (c) => {
  const u = requireUser(c, { allowSuspended: true });
  if (c.body.password !== u.password) throw new HttpError(403, 'Špatné heslo.');
  if (db.safety.some((s) => !s.endedAt && s.userId === u.id)) throw new HttpError(409, 'Účet teď nejde smazat – probíhá schůzka.');
  db.users = db.users.filter((x) => x.id !== u.id);
  return null;
});

// ověření totožnosti (simulované)
route('GET', '/verification', (c) => ({ status: requireUser(c).verificationStatus, message: '' }));
route('POST', '/verification/start', (c) => {
  requireUser(c).verificationStatus = 'pending';
  return { status: 201, json: { provider: 'demo', url: null } };
});
route('POST', '/verification/dev-decide', (c) => {
  const u = requireUser(c);
  u.verificationStatus = ageFrom(u.birthdate) >= MIN_AGE ? 'approved' : 'declined';
  return { status: u.verificationStatus, message: '' };
});

// objevování
route('GET', '/discover', (c) => {
  const me = requireVerified(c);
  const myAge = ageFrom(me.birthdate);
  return db.users
    .filter((u) => u.id !== me.id && u.status === 'active' && u.verificationStatus === 'approved')
    .filter((u) => !db.swipes.some((s) => s.from === me.id && s.to === u.id) && !blocked(me.id, u.id))
    .map((u) => ({ u, age: ageFrom(u.birthdate), d: km(me, u) ?? 0 }))
    .filter(
      ({ u, age, d }) =>
        me.interestedIn.includes(u.gender) &&
        u.interestedIn.includes(me.gender) &&
        age >= me.ageMin &&
        age <= me.ageMax &&
        myAge >= u.ageMin &&
        myAge <= u.ageMax &&
        d <= Math.min(me.maxDistanceKm, u.maxDistanceKm),
    )
    .sort((x, y) => x.d - y.d)
    .slice(0, 20)
    .map(({ u }) => publicProfile(u, me));
});

route('POST', '/swipes', (c) => {
  const me = requireVerified(c);
  const target = userById(Number(c.body.targetId));
  if (!target || target.id === me.id) throw new HttpError(404, 'Profil neexistuje.');
  const like = c.body.like === true;
  db.swipes = db.swipes.filter((s) => !(s.from === me.id && s.to === target.id));
  db.swipes.push({ from: me.id, to: target.id, like });
  if (!like) return { match: null };
  if (target.demo && !db.swipes.some((s) => s.from === target.id && s.to === me.id)) {
    db.swipes.push({ from: target.id, to: me.id, like: true });
  }
  if (!db.swipes.some((s) => s.from === target.id && s.to === me.id && s.like)) return { match: null };
  const [a, b] = [me.id, target.id].sort((x, y) => x - y);
  let m = db.matches.find((x) => x.a === a && x.b === b);
  if (!m) {
    m = { id: id(), a, b, createdAt: nowIso(), endedAt: null, partnerSafety: false, script: 0 };
    db.matches.push(m);
    if (target.demo) {
      const match = m;
      m.script = 1;
      later(4000, () => demoSay(match, target.id, REPLIES[0]));
    }
  }
  if (m.endedAt) return { match: null };
  return { match: { id: m.id, partner: publicProfile(target, me) } };
});

// matche a chat
route('GET', '/matches', (c) => {
  const me = requireVerified(c);
  return db.matches
    .filter((m) => (m.a === me.id || m.b === me.id) && !m.endedAt)
    .sort((x, y) => y.id - x.id)
    .map((m) => {
      const other = userById(m.a === me.id ? m.b : m.a)!;
      const last = db.messages.filter((x) => x.matchId === m.id).pop();
      const a = currentAgreement(m.id);
      return {
        id: m.id,
        matchedAt: m.createdAt,
        partner: publicProfile(other, me),
        lastMessage: last ? { text: last.text || 'Fotka', mine: last.senderId === me.id, at: last.createdAt } : null,
        agreementStatus: a ? agreementStatus(a, m) : null,
      };
    });
});

route('GET', '/matches/:id', (c, [mid]) => {
  const me = requireVerified(c);
  const { m, other } = matchFor(Number(mid), me.id);
  const mine = db.safety.find((s) => s.userId === me.id && s.matchId === m.id && !s.endedAt) ?? null;
  return {
    id: m.id,
    partner: publicProfile(other, me),
    agreement: agreementView(currentAgreement(m.id), m, me.id),
    safety: { mine: mine ? safetyView(mine) : null, partner: { active: m.partnerSafety } },
  };
});

route('DELETE', '/matches/:id', (c, [mid]) => {
  const me = requireVerified(c);
  matchFor(Number(mid), me.id).m.endedAt = nowIso();
  return null;
});

route('GET', '/matches/:id/messages', (c, [mid]) => {
  const me = requireVerified(c);
  const { m } = matchFor(Number(mid), me.id);
  const after = Number(new URLSearchParams(c.path.split('?')[1] ?? '').get('after') ?? 0);
  return db.messages
    .filter((x) => x.matchId === m.id && x.id > after)
    .map((x) => ({
      id: x.id,
      mine: x.senderId === me.id,
      text: x.text,
      imageUrl: x.imageUrl,
      warning: x.senderId === me.id ? '' : x.warning,
      createdAt: x.createdAt,
    }));
});

route('POST', '/matches/:id/messages', (c, [mid]) => {
  const me = requireVerified(c);
  const { m, other } = matchFor(Number(mid), me.id);
  const text = str(c.body.text);
  const image = typeof c.body.jpegBase64 === 'string' ? `data:image/jpeg;base64,${c.body.jpegBase64}` : null;
  if (!text && !image) throw new HttpError(400, 'Prázdná zpráva.');
  const verdict = moderate(text);
  if (verdict.action === 'block') throw new HttpError(422, `Zpráva nebyla odeslána. ${verdict.message}`);
  const msg: Message = {
    id: id(),
    matchId: m.id,
    senderId: me.id,
    text,
    imageUrl: image,
    warning: verdict.action === 'warn' ? (verdict.message ?? '') : '',
    createdAt: nowIso(),
  };
  db.messages.push(msg);
  demoReply(m, other);
  return { status: 201, json: { id: msg.id, mine: true, text, imageUrl: image, warning: '', createdAt: msg.createdAt } };
});

// dohoda
route('POST', '/matches/:id/agreement', (c, [mid]) => {
  const me = requireVerified(c);
  const { m, other } = matchFor(Number(mid), me.id);
  const b = c.body;
  if (b.consent !== true) throw new HttpError(400, 'Dohodu musíš výslovně potvrdit.');
  const activities = ((b.activities as string[]) ?? []).filter((x) => x in ACTIVITIES);
  if (activities.length === 0) throw new HttpError(400, 'V poli co ano vyber aspoň 1 možnost.');
  if (str(b.place).length < 2) throw new HttpError(400, 'Pole kde je příliš krátké.');
  if (str(b.safeword).length < 2) throw new HttpError(400, 'Pole stopslovo je příliš krátké.');
  const fields = {
    meetAt: new Date(str(b.meetAt)).toISOString(),
    place: str(b.place),
    activities,
    note: str(b.note),
    condom: b.condom === true,
    sober: b.sober === true,
    safeword: str(b.safeword),
  };
  const current = currentAgreement(m.id);
  const editable = current && ['pending', 'confirmed'].includes(agreementStatus(current, m));
  let a: Agreement;
  if (current && editable) {
    Object.assign(current, fields, { version: current.version + 1, proposedBy: me.id, updatedAt: nowIso(), confirmations: {} });
    a = current;
  } else {
    a = { id: id(), matchId: m.id, version: 1, proposedBy: me.id, ...fields, confirmations: {}, everConfirmedAt: null, revokedBy: null, revokedAt: null, updatedAt: nowIso() };
    db.agreements.push(a);
  }
  a.confirmations[me.id] = a.version;
  demoConfirm(m, other, a.id);
  return { status: editable ? 200 : 201, json: agreementView(a, m, me.id) };
});

route('POST', '/agreements/:id/confirm', (c, [aid]) => {
  const me = requireVerified(c);
  const a = db.agreements.find((x) => x.id === Number(aid));
  if (!a) throw new HttpError(404, 'Dohoda neexistuje.');
  const { m } = matchFor(a.matchId, me.id);
  if (c.body.consent !== true) throw new HttpError(400, 'Dohodu musíš výslovně potvrdit.');
  if (Number(c.body.version) !== a.version) throw new HttpError(409, 'Dohoda se mezitím změnila. Přečti si ji znovu.');
  if (!['pending', 'confirmed'].includes(agreementStatus(a, m))) throw new HttpError(409, 'Tuhle dohodu už nejde potvrdit.');
  a.confirmations[me.id] = a.version;
  if (fullyConfirmed(a, m) && !a.everConfirmedAt) a.everConfirmedAt = nowIso();
  return agreementView(a, m, me.id);
});

route('POST', '/agreements/:id/revoke', (c, [aid]) => {
  const me = requireUser(c, { allowSuspended: true });
  const a = db.agreements.find((x) => x.id === Number(aid));
  if (!a) throw new HttpError(404, 'Dohoda neexistuje.');
  const { m, other } = matchFor(a.matchId, me.id, true);
  if (!a.revokedAt) {
    a.revokedAt = nowIso();
    a.revokedBy = me.id;
    if (other.demo) later(2000, () => demoSay(m, other.id, 'Rozumím, v pohodě. Díky, že jsi to řekl/a.'));
  }
  return agreementView(a, m, me.id);
});

// bezpečnostní režim
route('POST', '/matches/:id/safety', (c, [mid]) => {
  const me = requireVerified(c);
  const { m, other } = matchFor(Number(mid), me.id);
  const a = currentAgreement(m.id);
  if (!a || agreementStatus(a, m) !== 'confirmed') throw new HttpError(409, 'Schůzku jde zahájit jen s dohodou, kterou jste potvrdili oba.');
  if (!me.trustedPhone || !me.checkinPin || !me.duressPin) throw new HttpError(409, 'Nejdřív si nastav důvěryhodnou osobu, PIN a nouzový PIN.');
  const minutes = Number(c.body.checkInMinutes ?? 30);
  if (!CHECK_IN_OPTIONS.includes(minutes)) throw new HttpError(400, 'Neplatný interval check-inu.');
  const existing = db.safety.find((s) => s.userId === me.id && s.matchId === m.id && !s.endedAt);
  if (existing) return safetyView(existing);
  const s: Safety = {
    id: id(),
    userId: me.id,
    matchId: m.id,
    agreementId: a.id,
    partnerName: other.name,
    partnerAge: ageFrom(other.birthdate),
    meetAt: a.meetAt,
    place: a.place,
    trustedName: me.trustedName,
    trustedPhone: me.trustedPhone,
    checkInMinutes: minutes,
    startedAt: nowIso(),
    lastCheckInAt: nowIso(),
    sosAt: null,
    silentAlarmAt: null,
    wrongPins: 0,
    overdueAlertedAt: null,
    endedAt: null,
    endKind: '',
    lat: null,
    lng: null,
    battery: null,
    locationAt: null,
  };
  db.safety.push(s);
  if (other.demo) later(2500, () => (m.partnerSafety = true));
  sms(s, `${me.name} má schůzku a vybral/a si tě jako důvěryhodnou osobu. Tady uvidíš, kde je a jestli je v pořádku: ${shareUrl(s)}`);
  return { status: 201, json: safetyView(s) };
});

function ownSafety(c: Ctx, sid: string, active = true) {
  const me = requireUser(c, { allowSuspended: true });
  const s = db.safety.find((x) => x.id === Number(sid) && x.userId === me.id);
  if (!s) throw new HttpError(404, 'Schůzka neexistuje.');
  if (active && s.endedAt) throw new HttpError(409, 'Schůzka už skončila.');
  return { me, s };
}

route('GET', '/safety/active', (c) => {
  const me = requireUser(c, { allowSuspended: true });
  return db.safety.filter((s) => s.userId === me.id && !s.endedAt).map(safetyView);
});
route('GET', '/safety/:id', (c, [sid]) => safetyView(ownSafety(c, sid, false).s));
route('POST', '/safety/:id/location', (c, [sid]) => {
  ownSafety(c, sid);
  return null;
});
route('POST', '/safety/:id/checkin', (c, [sid]) => {
  const { me, s } = ownSafety(c, sid);
  const r = checkPin(me, s, c.body.pin);
  if (r === 'wrong') throw new HttpError(403, 'Špatný PIN.');
  const wasAlerted = !!s.overdueAlertedAt;
  s.lastCheckInAt = nowIso();
  s.overdueAlertedAt = null;
  s.wrongPins = 0;
  if (r === 'duress') raiseSilentAlarm(s);
  else if (wasAlerted && !s.silentAlarmAt && !s.sosAt) sms(s, `${me.name} se ozval/a a potvrdil/a, že je v pořádku.`);
  return safetyView(s);
});
route('POST', '/safety/:id/sos', (c, [sid]) => {
  const { me, s } = ownSafety(c, sid);
  if (!s.sosAt) {
    s.sosAt = nowIso();
    if (!s.silentAlarmAt) sms(s, `POPLACH: ${me.name} potřebuje pomoc. Poloha a podrobnosti: ${shareUrl(s)}`);
  }
  return safetyView(s);
});
route('POST', '/safety/:id/sos/cancel', (c, [sid]) => {
  const { me, s } = ownSafety(c, sid);
  const r = checkPin(me, s, c.body.pin);
  if (r === 'wrong') throw new HttpError(403, 'Špatný PIN.');
  if (!s.sosAt) return safetyView(s);
  if (r === 'duress') {
    s.sosAt = null;
    s.silentAlarmAt = s.silentAlarmAt ?? nowIso();
  } else {
    s.sosAt = null;
    s.lastCheckInAt = nowIso();
    if (!s.silentAlarmAt) sms(s, `${me.name} zrušil/a poplach – byl to omyl, je v pořádku.`);
  }
  return safetyView(s);
});
route('POST', '/safety/:id/end', (c, [sid]) => {
  const { me, s } = ownSafety(c, sid);
  const r = checkPin(me, s, c.body.pin);
  if (r === 'wrong') throw new HttpError(403, 'Špatný PIN.');
  s.endedAt = nowIso();
  if (r === 'duress') {
    s.endKind = 'duress';
    const hadAlarm = !!(s.silentAlarmAt || s.sosAt);
    s.silentAlarmAt = s.silentAlarmAt ?? nowIso();
    if (!hadAlarm) sms(s, `POPLACH: ${me.name} potřebuje pomoc. Poloha a podrobnosti: ${shareUrl(s)}`);
  } else {
    s.endKind = 'ok';
    s.lat = s.lng = s.battery = null;
    s.locationAt = null;
    sms(s, `${me.name} ukončil/a schůzku a je v pořádku. Díky, že jsi byl/a k dispozici.`);
  }
  return safetyView(s);
});

// hodnocení po schůzce – v demu se nabídne hned po ukončení schůzky
route('GET', '/feedback/pending', (c) => {
  const me = requireVerified(c);
  return db.agreements
    .filter((a) => a.everConfirmedAt && !db.feedback.some((f) => f.agreementId === a.id && f.authorId === me.id))
    .map((a) => ({ a, m: db.matches.find((m) => m.id === a.matchId) }))
    .filter(({ a, m }) => m && (m.a === me.id || m.b === me.id) && db.safety.some((s) => s.agreementId === a.id && s.endedAt))
    .map(({ a, m }) => ({ agreementId: a.id, matchId: m!.id, partnerName: userById(m!.a === me.id ? m!.b : m!.a)?.name ?? '', meetAt: a.meetAt }));
});
route('POST', '/feedback/:id', (c, [aid]) => {
  const me = requireUser(c, { allowSuspended: true });
  if (db.feedback.some((f) => f.agreementId === Number(aid) && f.authorId === me.id)) throw new HttpError(409, 'Hodnocení už jsi poslal/a.');
  db.feedback.push({ agreementId: Number(aid), authorId: me.id });
  return { status: 201, json: { ok: true } };
});

// blokování a nahlášení
function blockUser(me: User, otherId: number) {
  db.blocks.push({ a: me.id, b: otherId });
  for (const m of db.matches) if ((m.a === me.id && m.b === otherId) || (m.b === me.id && m.a === otherId)) m.endedAt = m.endedAt ?? nowIso();
}
route('POST', '/users/:id/block', (c, [uid]) => {
  blockUser(requireUser(c, { allowSuspended: true }), Number(uid));
  return null;
});
route('POST', '/users/:id/report', (c, [uid]) => {
  blockUser(requireUser(c, { allowSuspended: true }), Number(uid));
  return { status: 201, json: { ok: true } };
});

export function handle(method: string, fullPath: string, body: unknown, authToken: string | null): Res {
  watchdog();
  const path = fullPath.split('?')[0];
  const userId = authToken ? db.tokens[authToken] : undefined;
  const c: Ctx = { method, path: fullPath, body: (body ?? {}) as Record<string, unknown>, user: userId ? (userById(userId) ?? null) : null, token: authToken };
  for (const [m, re, handler] of routes) {
    if (m !== method) continue;
    const match = path.match(re);
    if (!match) continue;
    try {
      const out = handler(c, match.slice(1));
      save();
      if (out === null || out === undefined) return { status: 204, json: null };
      if (typeof out === 'object' && 'status' in out && 'json' in out && Object.keys(out).length === 2) return out as Res;
      return { status: 200, json: out };
    } catch (err) {
      if (err instanceof HttpError) return { status: err.status, json: { error: err.message } };
      console.error(err);
      return { status: 500, json: { error: 'Něco se pokazilo. Zkus to znovu.' } };
    }
  }
  return { status: 404, json: { error: 'Nenalezeno.' } };
}
