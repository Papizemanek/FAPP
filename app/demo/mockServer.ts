// Simulovaný backend pro webový prototyp. Napodobuje chování server/ (stejné odpovědi, stejná pravidla
// souhlasu a bezpečnostního režimu), jen běží v prohlížeči nad daty v localStorage.
// Moderace zpráv je převzatá přímo ze serveru. Demo protějšky lajkují zpátky, odpovídají a potvrzují dohody.

import {
  ACTIVITIES,
  BOOST_MINUTES,
  CHECK_IN_GRACE_MINUTES,
  CHECK_IN_OPTIONS,
  FEATURES,
  FREE_LIKES_PER_WINDOW,
  LIKES_WINDOW_HOURS,
  MIN_AGE,
  PLANS,
  PRODUCTS,
  REVOKE_COOLDOWN_DAYS,
  sharedYes,
  TAG_GROUP,
  YES_GROUPS,
  SENT_LIKES_DAYS,
  TONIGHT_END_HOUR,
  TRAVEL_CITIES,
  WEEKLY_SUPER_LIKES,
  WRONG_PIN_ALARM_THRESHOLD,
  type BillingMode,
  type CreditKind,
  type FeatureId,
  type PlanId,
  type TravelCityId,
} from '@yesyes/shared';
import { moderate } from '../../server/src/services/moderation.js';
import { overlay } from './overlay';
import { newSecret, verifyTotp } from './totp';
import { srv, translateError } from './serverText';

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
  /** Dvoufázové ověření (TOTP) – klíč a záložní kódy. */
  totpSecret?: string | null;
  twoFactor?: boolean;
  recoveryCodes?: string[];
  verificationStatus: 'none' | 'pending' | 'approved' | 'declined';
  status: 'active' | 'suspended' | 'banned';
  demo: boolean;
  plan: PlanId;
  planExpiresAt: string | null;
  incognito: boolean;
  travelCity: TravelCityId | null;
  boostUntil: string | null;
  tonightUntil: string | null;
  credits: Record<CreditKind, number>;
};

type Match = { id: number; a: number; b: number; createdAt: string; endedAt: string | null; partnerSafety: boolean; script: number };
type Message = { id: number; matchId: number; senderId: number; text: string; imageUrl: string | null; warning: string; createdAt: string };
type Wish = 'yes' | 'maybe' | 'no';
type Agreement = {
  id: number;
  matchId: number;
  version: number;
  meetAt: string;
  place: string;
  condom: boolean;
  sober: boolean;
  publicFirst: boolean;
  safeword: string;
  wishes: Record<number, { wishes: Record<string, Wish>; note: string }>;
  confirmations: Record<number, number>;
  wasConfirmed: boolean;
  revokedBy: number | null;
  revokedAt: string | null;
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
  swipes: { from: number; to: number; like: boolean; super?: boolean; superCredit?: boolean; at?: string }[];
  boosts: { userId: number; fromPlan: boolean; at: string }[];
  billingMode: BillingMode;
  /** Demo: kolik lajků zdarma už je „spotřebovaných“ (tlačítko v demo panelu). */
  likeOffset: number;
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
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const STORAGE_KEY = 'yesyes-demo-db-v4';
const nowIso = () => new Date().toISOString();

// --- demo data ---

const freeBilling = () => ({
  plan: 'free' as PlanId,
  planExpiresAt: null,
  incognito: false,
  travelCity: null,
  boostUntil: null,
  tonightUntil: null,
  credits: { boost: 0, superlike: 0, tonight: 0 },
});

const TONES = ['#3B2A35', '#2B3340', '#3A3328', '#2E3A33', '#33293D', '#283640', '#3D2E2A', '#2F2F3D'];

function photo(name: string, i: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="960" viewBox="0 0 720 960"><rect width="720" height="960" fill="${TONES[i % TONES.length]}"/><circle cx="360" cy="380" r="150" fill="rgba(245,239,233,0.08)"/><text x="360" y="380" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="220" fill="#F5EFE9" text-anchor="middle" dominant-baseline="central">${name[0]}</text><text x="360" y="600" font-family="Helvetica, Arial, sans-serif" font-size="30" fill="rgba(245,239,233,0.55)" text-anchor="middle">ukázkový profil</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const DEMO_PEOPLE: [string, Gender, Gender[], string, string, string[]][] = [
  ['Lucie', 'woman', ['man'], '1997-03-12', 'Ráda začínám drinkem. Pak uvidíme.', ['oneoff', 'curious', 'chatFirst', 'host', 'single']],
  ['Klára', 'woman', ['man', 'woman'], '1992-07-01', 'Jasná domluva, žádné drama.', ['repeat', 'classic', 'boundaries', 'slow', 'visit']],
  ['Eva', 'woman', ['man'], '2000-11-23', 'Večer po práci, ne přes den.', ['oneoff', 'kink', 'boundaries', 'sober', 'visit', 'open']],
  ['Tereza', 'woman', ['woman', 'man'], '1995-01-30', 'Nejdřív kafe, pak se uvidí.', ['dateFirst', 'classic', 'chatFirst', 'neutral', 'single']],
  ['Barbora', 'woman', ['man', 'nonbinary'], '1990-09-14', 'Diskrétní, upřímná, nekuřačka.', ['repeat', 'openToMore', 'classic', 'sober', 'host', 'single']],
  ['Nikola', 'woman', ['woman'], '1998-05-02', 'Hledám holku na občasné večery.', ['repeat', 'curious', 'slow', 'visit', 'single']],
  ['Jakub', 'man', ['woman'], '1990-05-17', 'Sportovec, nekuřák, diskrétní.', ['repeat', 'classic', 'spontaneous', 'visit', 'single']],
  ['Martin', 'man', ['woman', 'man'], '1988-09-09', 'Pohodový, respektuju hranice.', ['oneoff', 'openToMore', 'curious', 'boundaries', 'host']],
  ['Tomáš', 'man', ['woman'], '1994-02-21', 'Vařím, běhám, rád se nechám překvapit.', ['oneoff', 'classic', 'spontaneous', 'host', 'single']],
  ['Ondřej', 'man', ['woman', 'nonbinary'], '1986-12-11', 'Klidný, čistý, testovaný.', ['repeat', 'classic', 'sober', 'boundaries', 'host', 'open']],
  ['Filip', 'man', ['woman'], '1999-08-08', 'Spontánní, ale vždycky s domluvou.', ['oneoff', 'curious', 'chatFirst', 'videoFirst', 'visit', 'single']],
  ['David', 'man', ['woman', 'man'], '1992-04-27', 'Přes den práce, večer volno.', ['repeat', 'kink', 'boundaries', 'chatFirst', 'neutral', 'poly']],
  ['Adam', 'man', ['man'], '1996-12-02', 'Hledám někoho na občasné večery.', ['repeat', 'kink', 'boundaries', 'host', 'poly']],
  ['Sam', 'nonbinary', ['man', 'woman', 'nonbinary'], '1998-04-04', 'Otevřené, citlivé, bez spěchu.', ['figuring', 'curious', 'slow', 'videoFirst', 'neutral']],
];

const ASCII = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function seed(): Db {
  const users: User[] = DEMO_PEOPLE.map(([name, gender, interestedIn, birthdate, bio, tags], i) => ({
    id: i + 1,
    email: `${ASCII(name)}@demo.yesyes`,
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
    ...freeBilling(),
    // Eva má zapnuté „Dnes večer“ (v demu jen v placeném režimu).
    tonightUntil: name === 'Eva' ? '2100-01-01T00:00:00.000Z' : null,
  }));
  // Lucii (demo účet) už tři lidé lajkli – Jakub super lajkem.
  const swipes: Db['swipes'] = [
    { from: 7, to: 1, like: true, super: true, at: nowIso() },
    { from: 9, to: 1, like: true, at: nowIso() },
    { from: 12, to: 1, like: true, at: nowIso() },
  ];
  return {
    nextId: 1000,
    users,
    tokens: {},
    swipes,
    matches: [],
    messages: [],
    agreements: [],
    safety: [],
    feedback: [],
    blocks: [],
    boosts: [],
    billingMode: 'free',
    likeOffset: 0,
  };
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

function km(a: { lat: number | null; lng: number | null }, b: { lat: number | null; lng: number | null }) {
  if (a.lat == null || b.lat == null || a.lng == null || b.lng == null) return null;
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const userById = (uid: number) => db.users.find((u) => u.id === uid);

// --- předplatné (stejná pravidla jako server/src/billing.js) ---

const DAY = 86400_000;
const activeUntil = (iso: string | null, now = Date.now()) => !!iso && Date.parse(iso) > now;
const planOf = (u: User): PlanId => (u.plan !== 'free' && activeUntil(u.planExpiresAt) ? u.plan : 'free');
const hasFeature = (u: User, f: FeatureId) => PLANS[planOf(u)].rank >= PLANS[FEATURES[f].plan].rank;

function effectiveLocation(u: User) {
  if (u.travelCity && hasFeature(u, 'travel')) {
    const c = TRAVEL_CITIES[u.travelCity];
    return { lat: c.lat, lng: c.lng, traveling: true };
  }
  return { lat: u.lat, lng: u.lng, traveling: false };
}

const paywall = (message: string, data: Record<string, unknown>) => new HttpError(402, message, data);
function requireFeature(u: User, f: FeatureId) {
  if (!hasFeature(u, f)) {
    const plan = FEATURES[f].plan;
    throw paywall(`${FEATURES[f].name} je součástí YesYes ${PLANS[plan].name}.`, { code: 'upgrade', plan });
  }
}

function likeQuota(u: User) {
  if (db.billingMode !== 'paid' || hasFeature(u, 'unlimitedLikes')) return { limit: null, used: 0, remaining: null, resetAt: null };
  const windowMs = LIKES_WINDOW_HOURS * 3600_000;
  const since = Date.now() - windowMs;
  const mine = db.swipes.filter((x) => x.from === u.id && x.like && !x.super && x.at && Date.parse(x.at) > since);
  const used = mine.length + db.likeOffset;
  const remaining = Math.max(0, FREE_LIKES_PER_WINDOW - used);
  const oldest = mine.map((x) => Date.parse(x.at!)).sort((a, b) => a - b)[0] ?? Date.now();
  return { limit: FREE_LIKES_PER_WINDOW, used, remaining, resetAt: remaining === 0 ? new Date(oldest + windowMs).toISOString() : null };
}

function weeklySuperLikesLeft(u: User) {
  if (!hasFeature(u, 'weeklySuperLikes')) return 0;
  const since = Date.now() - 7 * DAY;
  const used = db.swipes.filter((x) => x.from === u.id && x.super && !x.superCredit && x.at && Date.parse(x.at) > since).length;
  return Math.max(0, WEEKLY_SUPER_LIKES - used);
}

function monthlyBoostLeft(u: User) {
  if (!hasFeature(u, 'monthlyBoost')) return 0;
  return db.boosts.some((b) => b.userId === u.id && b.fromPlan && Date.parse(b.at) > Date.now() - 30 * DAY) ? 0 : 1;
}

function tonightEnd() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
      .formatToParts(new Date())
      .map((p) => [p.type, Number(p.value)]),
  );
  let left = (TONIGHT_END_HOUR * 60 - (parts.hour * 60 + parts.minute) + 1440) % 1440;
  if (left === 0) left = 1440;
  return new Date(Date.now() + left * 60_000).toISOString();
}

function billingStatus(u: User) {
  const plan = planOf(u);
  const features = Object.fromEntries((Object.keys(FEATURES) as FeatureId[]).map((f) => [f, hasFeature(u, f)])) as Record<FeatureId, boolean>;
  return {
    mode: db.billingMode,
    canPurchase: db.billingMode === 'paid',
    provider: 'dev',
    plan,
    planExpiresAt: plan === 'free' ? null : u.planExpiresAt,
    features,
    likes: likeQuota(u),
    superLikes: { weeklyLeft: weeklySuperLikesLeft(u), credits: u.credits.superlike },
    boost: { activeUntil: activeUntil(u.boostUntil) ? u.boostUntil : null, monthlyLeft: monthlyBoostLeft(u), credits: u.credits.boost },
    tonight: { activeUntil: activeUntil(u.tonightUntil) ? u.tonightUntil : null, included: features.tonight, credits: u.credits.tonight },
    incognito: u.incognito && features.incognito,
    travelCity: features.travel ? u.travelCity : null,
  };
}

/** Demo panel: přepnutí mezi startem zdarma a placeným režimem. */
export const billingMode = () => db.billingMode;
export function setBillingMode(mode: BillingMode) {
  db.billingMode = mode;
  db.likeOffset = 0;
  save();
}
/** Demo panel: nasimuluje 50 vyčerpaných lajků zdarma. */
export function exhaustLikes() {
  db.likeOffset = FREE_LIKES_PER_WINDOW;
  save();
}
const blocked = (a: number, b: number) => db.blocks.some((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));

/** Jako server: cizí vidí jen společná ano (bez místa a statusu), match všechno. */
function publicProfile(u: User, viewer: User | null, { matched = false } = {}) {
  const shared = viewer ? sharedYes(viewer.tags, u.tags, { matched }) : [];
  const d = viewer ? km(effectiveLocation(viewer), effectiveLocation(u)) : null;
  const here = effectiveLocation(u);
  return {
    id: u.id,
    name: u.name,
    age: ageFrom(u.birthdate),
    gender: u.gender,
    bio: u.bio,
    photos: u.photos.map((p) => p.url),
    tags: viewer && !matched ? shared : u.tags,
    sharedYes: shared,
    verified: u.verificationStatus === 'approved',
    distanceKm: d == null ? null : Math.max(1, Math.round(d)),
    traveling: here.traveling,
    // demo profily mají štítky jen v placeném režimu (na startu nikdo nic nekoupil)
    tonight: activeUntil(u.tonightUntil) && (!u.demo || db.billingMode === 'paid'),
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
    twoFactor: !!u.twoFactor,
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
  return [m.a, m.b].every((uid) => a.confirmations[uid] === a.version && !!a.wishes[uid]);
}

function agreementStatus(a: Agreement, m: Match) {
  if (a.revokedAt) return 'revoked';
  const confirmed = fullyConfirmed(a, m);
  if (Date.parse(a.meetAt) + 12 * 3600_000 < Date.now()) return confirmed ? 'past' : 'expired';
  return confirmed ? 'confirmed' : 'pending';
}

// Stejná pravidla jako server: druhý vidí jen shodu, nikdy cizí „ne“.
function overlapOf(x: Record<string, Wish>, y: Record<string, Wish>) {
  const yes: string[] = [];
  const maybe: string[] = [];
  for (const key of Object.keys(ACTIVITIES)) {
    const a = x[key] ?? 'no';
    const b = y[key] ?? 'no';
    if (a === 'yes' && b === 'yes') yes.push(key);
    else if (a !== 'no' && b !== 'no') maybe.push(key);
  }
  return { yes, maybe };
}

function agreementView(a: Agreement | null, m: Match, uid: number) {
  if (!a) return null;
  const other = m.a === uid ? m.b : m.a;
  const mine = a.wishes[uid];
  const theirs = a.wishes[other];
  return {
    id: a.id,
    version: a.version,
    status: agreementStatus(a, m),
    meetAt: a.meetAt,
    place: a.place,
    condom: a.condom,
    sober: a.sober,
    publicFirst: a.publicFirst,
    safeword: a.safeword,
    myWishes: mine?.wishes ?? null,
    myNote: mine?.note ?? '',
    partnerNote: theirs?.note ?? '',
    partnerFilled: !!theirs,
    overlap: mine && theirs ? overlapOf(mine.wishes, theirs.wishes) : null,
    confirmedByMe: a.confirmations[uid] === a.version && !!mine,
    confirmedByPartner: a.confirmations[other] === a.version && !!theirs,
    revokedByMe: a.revokedAt ? a.revokedBy === uid : null,
    revokedAt: a.revokedAt,
    redacted: false,
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

const shareUrl = (s: Safety) => `https://yesyesapp.com/s/${s.id}`;

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

const userName = (s: Safety) => userById(s.userId)?.name ?? srv('sms.someone');
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

// Hlídač check-inů – na serveru běží každých 30 s, tady při každém požadavku a každých 5 s.
function watchdog() {
  let changed = false;
  for (const s of db.safety) {
    if (s.endedAt || s.overdueAlertedAt || !overdue(s)) continue;
    s.overdueAlertedAt = nowIso();
    changed = true;
    if (s.sosAt || s.silentAlarmAt) continue;
    sms(s, srv('sms.overdue', { name: userName(s), time: time(new Date(due(s)).toISOString()), url: shareUrl(s) }));
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
  sms(s, srv('sms.alarm', { name: userName(s), url: shareUrl(s) }));
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

// Demo protějšek vyplní svá přání (naslepo) a potvrdí praktické věci.
const DEMO_WISHES: Record<string, Wish> = { kissing: 'yes', oral: 'yes', vaginal: 'maybe', anal: 'no', toys: 'maybe', overnight: 'no' };

function demoConfirm(m: Match, partner: User, agreementId: number) {
  if (!partner.demo) return;
  later(2500, () => {
    const a = db.agreements.find((x) => x.id === agreementId);
    if (!a || a.revokedAt) return;
    const first = !a.wishes[partner.id];
    a.wishes[partner.id] = a.wishes[partner.id] ?? { wishes: DEMO_WISHES, note: 'Bez focení, prosím.' };
    if (a.confirmations[partner.id] === a.version) return;
    a.confirmations[partner.id] = a.version;
    if (fullyConfirmed(a, m)) a.wasConfirmed = true;
    demoSay(m, partner.id, first ? 'Vyplnil/a jsem svoji část domluvy.' : 'Potvrdil/a jsem nový čas a místo.');
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

// auth – jako server: registrace a obnova hesla přes kód z e-mailu (v demu se ukáže jako „e-mail“),
// odpověď nikdy neprozradí, jestli účet existuje; volitelné dvoufázové ověření.
const codes = new Map<string, { code: string; payload?: Record<string, unknown>; attempts: number; expires: number }>();
const challenges = new Map<string, { userId: number; attempts: number; expires: number }>();
const sixDigits = () => String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');

function issueCode(purpose: string, email: string, payload?: Record<string, unknown>) {
  const code = sixDigits();
  codes.set(`${purpose}:${email}`, { code, payload, attempts: 0, expires: Date.now() + 15 * 60_000 });
  return code;
}
function consumeCode(purpose: string, email: string, given: unknown) {
  const key = `${purpose}:${email}`;
  const entry = codes.get(key);
  const bad = () => new HttpError(400, srv('auth.badCode'));
  if (!entry || entry.expires < Date.now() || entry.attempts >= 5) throw bad();
  if (String(given ?? '').replace(/\D/g, '') !== entry.code) {
    entry.attempts += 1;
    throw bad();
  }
  codes.delete(key);
  return entry.payload;
}
const mail = (to: string, key: string, params: Record<string, string> = {}) =>
  overlay.email({ to, subject: srv(`email.${key}.subject`, params), text: srv(`email.${key}.body`, params) });

function secondFactorOk(u: User, code: unknown) {
  if (u.totpSecret && verifyTotp(u.totpSecret, String(code ?? ''))) return true;
  const raw = String(code ?? '').toLowerCase().replace(/[^0-9a-z]/g, '');
  const i = (u.recoveryCodes ?? []).indexOf(raw);
  if (i < 0) return false;
  u.recoveryCodes!.splice(i, 1);
  return true;
}
const recoveryCodes = () => Array.from({ length: 10 }, () => Math.random().toString(36).slice(2, 12).padEnd(10, '0'));

function signInUser(u: User, status = 200) {
  const t = token();
  db.tokens[t] = u.id;
  save();
  return { status, json: { token: t, user: own(u) } };
}

route('POST', '/auth/register', (c) => {
  const b = c.body;
  const email = str(b.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Neplatný e-mail.');
  if (str(b.password).length < 10) throw new HttpError(400, 'Pole heslo je příliš krátké.');
  if (str(b.name).length < 2) throw new HttpError(400, 'Pole jméno je příliš krátké.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str(b.birthdate))) throw new HttpError(400, 'Neplatné datum narození.');
  if (b.confirmAdult !== true) throw new HttpError(400, 'Musíš potvrdit, že je ti 18 let nebo víc.');
  if (b.acceptRules !== true) throw new HttpError(400, 'Musíš souhlasit s pravidly a se zpracováním údajů.');
  if (ageFrom(str(b.birthdate)) < MIN_AGE) throw new HttpError(403, 'YesYes je jen pro lidi starší 18 let.');
  if (db.users.some((u) => u.email === email)) mail(email, 'accountExists');
  else mail(email, 'registerCode', { code: issueCode('register', email, b) });
  return { status: 202, json: { pending: true } };
});

route('POST', '/auth/register/verify', (c) => {
  const email = str(c.body.email).toLowerCase();
  const b = consumeCode('register', email, c.body.code) as Record<string, unknown>;
  if (db.users.some((u) => u.email === email)) throw new HttpError(400, srv('auth.badCode'));
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
    ...freeBilling(),
  };
  db.users.push(user);
  // Ať je v „Lajkách“ co ukázat: pár demo lidí, kteří o nového člověka stojí, ho rovnou lajkne.
  db.users
    .filter((u) => u.demo && u.interestedIn.includes(user.gender) && user.interestedIn.includes(u.gender))
    .slice(0, 3)
    .forEach((u, i) => db.swipes.push({ from: u.id, to: user.id, like: true, super: i === 0, at: nowIso() }));
  return signInUser(user, 201);
});

route('POST', '/auth/login', (c) => {
  const u = db.users.find((x) => x.email === str(c.body.email).toLowerCase());
  if (!u || u.password !== c.body.password) throw new HttpError(401, 'Špatný e-mail nebo heslo.');
  if (u.twoFactor) {
    const challenge = token();
    challenges.set(challenge, { userId: u.id, attempts: 0, expires: Date.now() + 5 * 60_000 });
    return { twoFactor: true, challenge };
  }
  mail(u.email, 'newLogin', { device: 'Tento prohlížeč' });
  return signInUser(u).json;
});
route('POST', '/auth/login/2fa', (c) => {
  const ch = challenges.get(str(c.body.challenge));
  const u = ch && db.users.find((x) => x.id === ch.userId);
  if (!ch || !u || ch.expires < Date.now() || ch.attempts >= 5) throw new HttpError(401, srv('auth.loginExpired'));
  if (!secondFactorOk(u, c.body.code)) {
    ch.attempts += 1;
    throw new HttpError(400, srv('auth.badCode'));
  }
  challenges.delete(str(c.body.challenge));
  return signInUser(u).json;
});
route('POST', '/auth/password/forgot', (c) => {
  const email = str(c.body.email).toLowerCase();
  const u = db.users.find((x) => x.email === email);
  if (u) mail(email, 'resetCode', { code: issueCode('reset', email) });
  return { status: 202, json: { pending: true } };
});
route('POST', '/auth/password/reset', (c) => {
  const email = str(c.body.email).toLowerCase();
  if (str(c.body.password).length < 10) throw new HttpError(400, 'Pole heslo je příliš krátké.');
  consumeCode('reset', email, c.body.code);
  const u = db.users.find((x) => x.email === email);
  if (!u) throw new HttpError(400, srv('auth.badCode'));
  u.password = str(c.body.password);
  for (const [t, id] of Object.entries(db.tokens)) if (id === u.id) delete db.tokens[t];
  mail(email, 'passwordChanged');
  return null;
});

// zabezpečení účtu
const myTokens = (c: Ctx) => Object.entries(db.tokens).filter(([, id]) => id === c.user?.id).map(([t]) => t);
route('GET', '/me/sessions', (c) => {
  requireUser(c, { allowSuspended: true });
  return myTokens(c).map((t, i) => ({ id: i + 1, kind: 'web', device: t === c.token ? 'Tento prohlížeč' : 'Jiné zařízení', createdAt: nowIso(), lastUsedAt: nowIso(), current: t === c.token }));
});
route('DELETE', '/me/sessions/:id', (c, [sid]) => {
  requireUser(c, { allowSuspended: true });
  const t = myTokens(c)[Number(sid) - 1];
  if (t && t !== c.token) delete db.tokens[t];
  return null;
});
route('POST', '/me/sessions/revoke-others', (c) => {
  requireUser(c, { allowSuspended: true });
  for (const t of myTokens(c)) if (t !== c.token) delete db.tokens[t];
  return null;
});
route('PUT', '/me/password', (c) => {
  const u = requireUser(c, { allowSuspended: true });
  if (c.body.password !== u.password) throw new HttpError(403, 'Špatné heslo.');
  if (str(c.body.newPassword).length < 10) throw new HttpError(400, 'Pole nové heslo je příliš krátké.');
  u.password = str(c.body.newPassword);
  for (const t of myTokens(c)) if (t !== c.token) delete db.tokens[t];
  mail(u.email, 'passwordChanged');
  return null;
});
route('POST', '/me/2fa/setup', (c) => {
  const u = requireUser(c, { allowSuspended: true });
  if (c.body.password !== u.password) throw new HttpError(403, 'Špatné heslo.');
  u.totpSecret = newSecret();
  return { secret: u.totpSecret, otpauthUrl: `otpauth://totp/YesYes:${encodeURIComponent(u.email)}?secret=${u.totpSecret}&issuer=YesYes` };
});
route('POST', '/me/2fa/enable', (c) => {
  const u = requireUser(c, { allowSuspended: true });
  if (!u.totpSecret || !verifyTotp(u.totpSecret, str(c.body.code))) throw new HttpError(400, srv('auth.badCode'));
  u.twoFactor = true;
  u.recoveryCodes = recoveryCodes();
  mail(u.email, 'twoFactorOn');
  return { recoveryCodes: u.recoveryCodes.map((x) => `${x.slice(0, 5)}-${x.slice(5)}`), user: own(u) };
});
route('POST', '/me/2fa/disable', (c) => {
  const u = requireUser(c, { allowSuspended: true });
  if (c.body.password !== u.password) throw new HttpError(403, 'Špatné heslo.');
  if (!secondFactorOk(u, c.body.code)) throw new HttpError(400, srv('auth.badCode'));
  Object.assign(u, { twoFactor: false, totpSecret: null, recoveryCodes: [] });
  mail(u.email, 'twoFactorOff');
  return { user: own(u) };
});

route('POST', '/auth/logout', (c) => {
  if (c.token) delete db.tokens[c.token];
  return null;
});
route('PUT', '/auth/push-token', () => null);

// Limit štítků ve skupině – jako server.
function yesTags(value: unknown): string[] {
  const tags = [...new Set(Array.isArray(value) ? (value as string[]) : [])].filter((tag) => tag in TAG_GROUP);
  for (const [group, { max }] of Object.entries(YES_GROUPS)) {
    if (tags.filter((tag) => TAG_GROUP[tag as keyof typeof TAG_GROUP] === group).length > max) {
      throw new HttpError(400, srv('profile.tooManyYes', { group: srv(`yesGroups.${group}`), count: max }));
    }
  }
  return tags;
}

// profil
route('GET', '/me', (c) => own(requireUser(c, { allowSuspended: true })));
route('PUT', '/me', (c) => {
  const u = requireUser(c, { allowSuspended: true });
  const b = c.body;
  const verdict = moderate(str(b.bio));
  if (verdict.action === 'block') throw new HttpError(400, srv(verdict.messageKey ?? 'errors.generic'));
  if (Number(b.ageMin) > Number(b.ageMax)) throw new HttpError(400, 'Věk od musí být menší než věk do.');
  Object.assign(u, {
    name: str(b.name) || u.name,
    bio: str(b.bio),
    interestedIn: b.interestedIn,
    tags: yesTags(b.tags),
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
  if (u.twoFactor && !secondFactorOk(u, c.body.code)) throw new HttpError(400, srv('auth.badCode'));
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
  const here = effectiveLocation(me);
  const paidWorld = db.billingMode === 'paid';
  const likedMe = new Map(db.swipes.filter((x) => x.to === me.id && x.like).map((x) => [x.from, !!x.super]));
  // Pořadí jako na serveru: super lajk → prioritní lajk → boost → Dnes večer → vzdálenost.
  const tier = (u: User) => {
    if (likedMe.get(u.id) && (paidWorld || !u.demo)) return 0;
    if (likedMe.has(u.id) && hasFeature(u, 'priorityLikes')) return 1;
    if (activeUntil(u.boostUntil)) return 2;
    if (activeUntil(u.tonightUntil) && (paidWorld || !u.demo)) return 3;
    return 4;
  };
  return db.users
    .filter((u) => u.id !== me.id && u.status === 'active' && u.verificationStatus === 'approved')
    .filter((u) => !db.swipes.some((x) => x.from === me.id && x.to === u.id) && !blocked(me.id, u.id))
    .filter((u) => !(u.incognito && hasFeature(u, 'incognito') && !likedMe.has(u.id)))
    .map((u) => ({ u, age: ageFrom(u.birthdate), d: km(here, effectiveLocation(u)) ?? 0, t: tier(u), s: sharedYes(me.tags, u.tags).length }))
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
    .sort((x, y) => x.t - y.t || y.s - x.s || x.d - y.d)
    .slice(0, 20)
    .map(({ u }) => ({ ...publicProfile(u, me), superLike: !!likedMe.get(u.id) && (paidWorld || !u.demo) }));
});

route('POST', '/swipes', (c) => {
  const me = requireVerified(c);
  const target = userById(Number(c.body.targetId));
  if (!target || target.id === me.id) throw new HttpError(404, 'Profil neexistuje.');
  const like = c.body.like === true;
  const superLike = c.body.super === true;
  if (superLike && !like) throw new HttpError(400, 'Super lajk je vždycky lajk.');
  const quota = likeQuota(me);
  if (like && !superLike && quota.remaining === 0) {
    throw paywall('Došly ti lajky. Další přibudou za chvíli – nebo swipuj bez limitu s YesYes Plus.', { code: 'like_limit', resetAt: quota.resetAt });
  }
  let superCredit = false;
  if (superLike && weeklySuperLikesLeft(me) === 0) {
    if (me.credits.superlike <= 0) throw paywall('Nemáš žádný super lajk.', { code: 'no_credit', credit: 'superlike' });
    me.credits.superlike -= 1;
    superCredit = true;
  }
  db.swipes = db.swipes.filter((x) => !(x.from === me.id && x.to === target.id));
  db.swipes.push({ from: me.id, to: target.id, like, super: superLike, superCredit, at: nowIso() });
  const likesLeft = quota.remaining === null ? null : like && !superLike ? quota.remaining - 1 : quota.remaining;
  if (!like) return { match: null, likesLeft };
  if (target.demo && !db.swipes.some((x) => x.from === target.id && x.to === me.id)) {
    db.swipes.push({ from: target.id, to: me.id, like: true, at: nowIso() });
  }
  if (!db.swipes.some((x) => x.from === target.id && x.to === me.id && x.like)) return { match: null, likesLeft };
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
  if (m.endedAt) return { match: null, likesLeft };
  return { match: { id: m.id, partner: publicProfile(target, me, { matched: true }) }, likesLeft };
});

route('POST', '/swipes/rewind', (c) => {
  const me = requireVerified(c);
  requireFeature(me, 'rewind');
  const last = [...db.swipes].filter((x) => x.from === me.id).sort((x, y) => (y.at ?? '').localeCompare(x.at ?? ''))[0];
  if (!last) throw new HttpError(404, 'Není co vracet.');
  if (last.super) throw new HttpError(409, 'Super lajk vrátit nejde.');
  const [a, b] = [me.id, last.to].sort((x, y) => x - y);
  if (db.matches.some((m) => m.a === a && m.b === b)) throw new HttpError(409, 'Z tohohle swipu už je match.');
  db.swipes = db.swipes.filter((x) => x !== last);
  const target = userById(last.to);
  if (!target) throw new HttpError(404, 'Profil už neexistuje.');
  return { profile: publicProfile(target, me) };
});

// předplatné
route('GET', '/billing', (c) => billingStatus(requireVerified(c)));
route('POST', '/billing/purchase', (c) => {
  const me = requireVerified(c);
  if (db.billingMode !== 'paid') throw new HttpError(403, 'Platby zatím nejsou zapnuté – YesYes je teď celý zdarma.');
  const productId = str(c.body.productId);
  if (!Object.hasOwn(PRODUCTS, productId)) throw new HttpError(400, 'Neznámý produkt.');
  const product = PRODUCTS[productId as keyof typeof PRODUCTS];
  if (product.kind === 'plan') {
    // vyšší úroveň vyhrává; stejná nebo nižší prodlouží
    const from = activeUntil(me.planExpiresAt) ? Date.parse(me.planExpiresAt!) : Date.now();
    const d = new Date(from);
    d.setUTCMonth(d.getUTCMonth() + product.months);
    if (PLANS[product.plan].rank >= PLANS[planOf(me)].rank) me.plan = product.plan;
    me.planExpiresAt = d.toISOString();
  } else {
    me.credits[product.credit] += product.amount;
  }
  return billingStatus(me);
});
route('POST', '/billing/boost', (c) => {
  const me = requireVerified(c);
  if (activeUntil(me.boostUntil)) throw new HttpError(409, 'Boost už běží.');
  const fromPlan = monthlyBoostLeft(me) > 0;
  if (!fromPlan) {
    if (me.credits.boost <= 0) throw paywall('Nemáš žádný boost.', { code: 'no_credit', credit: 'boost' });
    me.credits.boost -= 1;
  }
  db.boosts.push({ userId: me.id, fromPlan, at: nowIso() });
  me.boostUntil = new Date(Date.now() + BOOST_MINUTES * 60_000).toISOString();
  return billingStatus(me);
});
route('POST', '/billing/tonight', (c) => {
  const me = requireVerified(c);
  if (activeUntil(me.tonightUntil)) throw new HttpError(409, 'Dnes večer už máš zapnuté.');
  if (!hasFeature(me, 'tonight')) {
    if (me.credits.tonight <= 0) throw paywall('„Dnes večer“ je v Platinum nebo jednorázově.', { code: 'no_credit', credit: 'tonight' });
    me.credits.tonight -= 1;
  }
  me.tonightUntil = tonightEnd();
  return billingStatus(me);
});
route('DELETE', '/billing/tonight', (c) => {
  const me = requireVerified(c);
  me.tonightUntil = null;
  return billingStatus(me);
});
route('PUT', '/billing/settings', (c) => {
  const me = requireVerified(c);
  const { incognito, travelCity } = c.body;
  if (incognito !== undefined) {
    if (incognito === true) requireFeature(me, 'incognito');
    me.incognito = incognito === true;
  }
  if (travelCity !== undefined) {
    if (travelCity === null || travelCity === '') me.travelCity = null;
    else {
      if (typeof travelCity !== 'string' || !Object.hasOwn(TRAVEL_CITIES, travelCity)) throw new HttpError(400, 'Neznámé město.');
      requireFeature(me, 'travel');
      me.travelCity = travelCity as TravelCityId;
    }
  }
  return billingStatus(me);
});
route('GET', '/likes', (c) => {
  const me = requireVerified(c);
  const paidWorld = db.billingMode === 'paid';
  const likers = db.swipes
    .filter((x) => x.to === me.id && x.like && !db.swipes.some((y) => y.from === me.id && y.to === x.from) && !blocked(me.id, x.from))
    .map((x) => ({ u: userById(x.from), x }))
    .filter((r): r is { u: User; x: Db['swipes'][number] } => !!r.u && r.u.status === 'active')
    .sort((p, q) => Number(!!q.x.super) - Number(!!p.x.super));
  if (!hasFeature(me, 'seeLikes')) return { count: likers.length, profiles: [] };
  return {
    count: likers.length,
    profiles: likers.map(({ u, x }) => ({ ...publicProfile(u, me), superLike: !!x.super && (paidWorld || !u.demo) })),
  };
});
route('GET', '/likes/sent', (c) => {
  const me = requireVerified(c);
  requireFeature(me, 'sentLikes');
  const since = Date.now() - SENT_LIKES_DAYS * DAY;
  return db.swipes
    .filter((x) => x.from === me.id && x.like && x.at && Date.parse(x.at) > since)
    .filter((x) => !db.swipes.some((y) => y.from === x.to && y.to === me.id && y.like))
    .map((x) => ({ u: userById(x.to), x }))
    .filter((r) => !!r.u)
    .map(({ u, x }) => ({ ...publicProfile(u!, me), superLike: !!x.super }));
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
        partner: publicProfile(other, me, { matched: true }),
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
    partner: publicProfile(other, me, { matched: true }),
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
      warning: x.senderId === me.id || !x.warning ? '' : x.warning.startsWith('moderation.') ? srv(x.warning) : x.warning,
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
  if (verdict.action === 'block') throw new HttpError(422, srv('chat.notSent', { reason: srv(verdict.messageKey ?? 'errors.generic') }));
  const msg: Message = {
    id: id(),
    matchId: m.id,
    senderId: me.id,
    text,
    imageUrl: image,
    // jako na serveru: ukládá se klíč, přeloží se až pro toho, kdo zprávu čte
    warning: verdict.action === 'warn' ? (verdict.messageKey ?? '') : '',
    createdAt: nowIso(),
  };
  db.messages.push(msg);
  demoReply(m, other);
  return { status: 201, json: { id: msg.id, mine: true, text, imageUrl: image, warning: '', createdAt: msg.createdAt } };
});

// domluva
route('POST', '/matches/:id/agreement', (c, [mid]) => {
  const me = requireVerified(c);
  const { m, other } = matchFor(Number(mid), me.id);
  const b = c.body;
  if (b.intent !== true || b.notice !== true) throw new HttpError(400, 'Potvrď obě věty – že je to tvoje představa a že domluva není souhlas.');
  if (str(b.place).length < 2) throw new HttpError(400, 'Pole kde je příliš krátké.');
  if (str(b.safeword).length < 2) throw new HttpError(400, 'Pole stopslovo je příliš krátké.');
  const wishes: Record<string, Wish> = {};
  for (const key of Object.keys(ACTIVITIES)) wishes[key] = ((b.wishes as Record<string, Wish>)?.[key] ?? 'no') as Wish;
  const logistics = {
    meetAt: new Date(str(b.meetAt)).toISOString(),
    place: str(b.place),
    condom: b.condom === true,
    sober: b.sober === true,
    publicFirst: b.publicFirst === true,
    safeword: str(b.safeword),
  };
  const current = currentAgreement(m.id);
  const editable = current && ['pending', 'confirmed'].includes(agreementStatus(current, m));
  if (!editable && current?.revokedAt && current.revokedBy !== me.id && Date.now() < Date.parse(current.revokedAt) + REVOKE_COOLDOWN_DAYS * 86400_000) {
    throw new HttpError(403, `Novou domluvu teď může otevřít jen ${other.name}.`);
  }
  let a: Agreement;
  let changed = false;
  if (current && editable) {
    if (b.baseVersion !== undefined && Number(b.baseVersion) !== current.version) throw new HttpError(409, 'Domluva se mezitím změnila. Přečti si ji znovu.');
    changed = (Object.keys(logistics) as (keyof typeof logistics)[]).some((k) => current[k] !== logistics[k]);
    if (changed) Object.assign(current, logistics, { version: current.version + 1, confirmations: {} });
    a = current;
  } else {
    a = { id: id(), matchId: m.id, version: 1, ...logistics, wishes: {}, confirmations: {}, wasConfirmed: false, revokedBy: null, revokedAt: null };
    db.agreements.push(a);
  }
  a.wishes[me.id] = { wishes, note: str(b.note) };
  a.confirmations[me.id] = a.version;
  if (fullyConfirmed(a, m)) a.wasConfirmed = true;
  if (!editable || changed || !a.wishes[other.id] || a.confirmations[other.id] !== a.version) demoConfirm(m, other, a.id);
  return { status: editable ? 200 : 201, json: agreementView(a, m, me.id) };
});

route('POST', '/agreements/:id/revoke', (c, [aid]) => {
  const me = requireUser(c, { allowSuspended: true });
  const a = db.agreements.find((x) => x.id === Number(aid));
  if (!a) throw new HttpError(404, 'Domluva neexistuje.');
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
  if (!a || agreementStatus(a, m) !== 'confirmed') throw new HttpError(409, 'Schůzku jde zahájit, až domluvu vyplníte a potvrdíte oba.');
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
  sms(s, srv('sms.started', { name: me.name, url: shareUrl(s) }));
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
  else if (wasAlerted && !s.silentAlarmAt && !s.sosAt) sms(s, srv('sms.backOk', { name: me.name }));
  return safetyView(s);
});
route('POST', '/safety/:id/sos', (c, [sid]) => {
  const { me, s } = ownSafety(c, sid);
  if (!s.sosAt) {
    s.sosAt = nowIso();
    if (!s.silentAlarmAt) sms(s, srv('sms.alarm', { name: me.name, url: shareUrl(s) }));
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
    if (!s.silentAlarmAt) sms(s, srv('sms.sosCancelled', { name: me.name }));
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
    if (!hadAlarm) sms(s, srv('sms.alarm', { name: me.name, url: shareUrl(s) }));
  } else {
    s.endKind = 'ok';
    s.lat = s.lng = s.battery = null;
    s.locationAt = null;
    sms(s, srv('sms.endedOk', { name: me.name }));
  }
  return safetyView(s);
});

// hodnocení po schůzce – v demu se nabídne hned po ukončení schůzky
route('GET', '/feedback/pending', (c) => {
  const me = requireVerified(c);
  return db.agreements
    .filter((a) => a.wasConfirmed && !db.feedback.some((f) => f.agreementId === a.id && f.authorId === me.id))
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
      if (err instanceof HttpError) return { status: err.status, json: { ...err.data, error: translateError(err.message) } };
      console.error(err);
      return { status: 500, json: { error: 'Něco se pokazilo. Zkus to znovu.' } };
    }
  }
  return { status: 404, json: { error: 'Nenalezeno.' } };
}
