import { ACTIVITIES, CHECK_IN_GRACE_MINUTES, sharedYes } from '../../shared/constants.js';
import { effectiveLocation, isActiveUntil } from './billing.js';
import { imageUrl } from './images.js';
import { HttpError, ageFrom, distanceKm, nowIso, parseJson } from './util.js';

// Domluva je „proběhlá“ 12 hodin po plánovaném začátku schůzky.
const AGREEMENT_PAST_AFTER_MS = 12 * 3600_000;

export const getUser = (db, id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

/**
 * Profil, jak ho vidí `viewer`. Štítky „Moje ano*“: cizí vidí jen společná ano (bez místa a vztahového
 * statusu), match vidí všechny štítky druhého a společná ano včetně místa a statusu.
 */
export function publicProfile(user, viewer, { matched = false } = {}) {
  let distance = null;
  const here = effectiveLocation(user);
  if (viewer && viewer.lat != null && here.lat != null) {
    const from = effectiveLocation(viewer);
    distance = Math.max(1, Math.round(distanceKm(from.lat, from.lng, here.lat, here.lng)));
  }
  return {
    id: user.id,
    name: user.name,
    age: ageFrom(user.birthdate),
    gender: user.gender,
    bio: user.bio,
    photos: parseJson(user.photos, []).map(imageUrl),
    ...yesView(parseJson(user.tags, []), viewer ? parseJson(viewer.tags, []) : null, matched),
    verified: user.verification_status === 'approved',
    distanceKm: distance,
    traveling: here.traveling,
    tonight: isActiveUntil(user.tonight_until),
  };
}

function yesView(theirs, mine, matched) {
  if (!mine) return { tags: theirs, sharedYes: [] };
  const shared = sharedYes(mine, theirs, { matched });
  return { tags: matched ? theirs : shared, sharedYes: shared };
}

export function ownProfile(user) {
  return {
    ...publicProfile(user, null),
    photoIds: parseJson(user.photos, []),
    email: user.email,
    birthdate: user.birthdate,
    interestedIn: parseJson(user.interested_in, []),
    ageMin: user.age_min,
    ageMax: user.age_max,
    maxDistanceKm: user.max_distance_km,
    hasLocation: user.lat != null,
    trustedName: user.trusted_name,
    trustedPhone: user.trusted_phone,
    hasCheckinPin: !!user.checkin_pin_hash,
    hasDuressPin: !!user.duress_pin_hash,
    twoFactor: !!user.totp_enabled,
    discreet: !!user.discreet,
    verificationStatus: user.verification_status,
    status: user.status,
  };
}

export function isBlocked(db, a, b) {
  return !!db
    .prepare('SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)')
    .get(a, b, b, a);
}

/** Match, ve kterém je uživatel jednou ze stran, jinak 404. */
export function getMatchFor(db, matchId, userId, { allowEnded = false } = {}) {
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(Number(matchId));
  if (!match || (match.user_a !== userId && match.user_b !== userId)) {
    throw new HttpError(404, 'match.notFound');
  }
  if (match.ended_at && !allowEnded) throw new HttpError(410, 'match.ended');
  const otherId = match.user_a === userId ? match.user_b : match.user_a;
  return { match, otherId, other: getUser(db, otherId) };
}

export function requireActivePartner(other) {
  if (!other || other.status !== 'active') throw new HttpError(410, 'match.profileUnavailable');
}

// --- domluva ---
// Domluva není souhlas. Každý si zvlášť vyplní přání (ano/možná/ne); druhý vidí jen shodu,
// nikdy cizí „ne“. Společné jsou jen praktické věci (kdy, kde, stopslovo, ochrana).

export const currentAgreement = (db, matchId) =>
  db.prepare('SELECT * FROM agreements WHERE match_id = ? ORDER BY id DESC LIMIT 1').get(matchId);

function confirmationsFor(db, agreement) {
  return db
    .prepare('SELECT user_id, version FROM agreement_confirmations WHERE agreement_id = ?')
    .all(agreement.id)
    .filter((c) => c.version === agreement.version);
}

const wishesRows = (db, agreement) =>
  db.prepare('SELECT user_id, wishes, note FROM agreement_wishes WHERE agreement_id = ?').all(agreement.id);

/** Potvrzená = oba vyplnili svá přání a oba potvrdili aktuální verzi praktických věcí. */
export function isFullyConfirmed(db, agreement, match) {
  const c = confirmationsFor(db, agreement);
  const w = wishesRows(db, agreement);
  return [match.user_a, match.user_b].every((uid) => c.some((x) => x.user_id === uid) && w.some((x) => x.user_id === uid));
}

export function agreementStatus(db, agreement, match, now = Date.now()) {
  if (agreement.revoked_at) return 'revoked';
  const confirmed = agreement.redacted_at ? !!agreement.was_confirmed : isFullyConfirmed(db, agreement, match);
  if (Date.parse(agreement.meet_at) + AGREEMENT_PAST_AFTER_MS < now) return confirmed ? 'past' : 'expired';
  return confirmed ? 'confirmed' : 'pending';
}

/** Shoda: „ano“ jen když chtějí oba, „možná“ když je to pro oba aspoň možná. Ostatní se nezobrazí. */
export function overlapOf(a, b) {
  const yes = [];
  const maybe = [];
  for (const key of Object.keys(ACTIVITIES)) {
    const x = a[key] ?? 'no';
    const y = b[key] ?? 'no';
    if (x === 'yes' && y === 'yes') yes.push(key);
    else if (x !== 'no' && y !== 'no') maybe.push(key);
  }
  return { yes, maybe };
}

export function agreementView(db, agreement, match, viewerId, open) {
  if (!agreement) return null;
  const confirmations = confirmationsFor(db, agreement);
  const otherId = match.user_a === viewerId ? match.user_b : match.user_a;
  const rows = wishesRows(db, agreement);
  const mine = rows.find((r) => r.user_id === viewerId);
  const theirs = rows.find((r) => r.user_id === otherId);
  const myWishes = mine ? parseJson(open(mine.wishes), {}) : null;
  const theirWishes = theirs ? parseJson(open(theirs.wishes), {}) : null;
  return {
    id: agreement.id,
    version: agreement.version,
    status: agreementStatus(db, agreement, match),
    meetAt: agreement.meet_at,
    place: agreement.place,
    condom: !!agreement.condom,
    sober: !!agreement.sober,
    publicFirst: !!agreement.public_first,
    safeword: open(agreement.safeword),
    myWishes,
    myNote: mine ? open(mine.note) : '',
    partnerNote: theirs ? open(theirs.note) : '',
    partnerFilled: !!theirs,
    // Cizí přání se nikdy neposílají – jen průnik, a to až když vyplnili oba.
    overlap: myWishes && theirWishes ? overlapOf(myWishes, theirWishes) : null,
    // Bez časů: potvrzení není záznam souhlasu.
    confirmedByMe: confirmations.some((c) => c.user_id === viewerId) && !!mine,
    confirmedByPartner: confirmations.some((c) => c.user_id === otherId) && !!theirs,
    revokedByMe: agreement.revoked_at ? agreement.revoked_by === viewerId : null,
    revokedAt: agreement.revoked_at,
    redacted: !!agreement.redacted_at,
  };
}

/** Uchová domluvu a s ní spojené schůzky – na žádost toho, kdo hlásí problém. */
export function preserveAgreement(db, agreementId) {
  if (!agreementId) return;
  db.prepare('UPDATE agreements SET preserved_at = COALESCE(preserved_at, ?) WHERE id = ?').run(nowIso(), agreementId);
  db.prepare('UPDATE safety_sessions SET preserved = 1 WHERE agreement_id = ?').run(agreementId);
}

// --- bezpečnostní režim ---

export const nextCheckInDue = (s) => Date.parse(s.last_check_in_at) + s.check_in_minutes * 60_000;

export const isOverdue = (s, now = Date.now()) =>
  !s.ended_at && now > nextCheckInDue(s) + CHECK_IN_GRACE_MINUTES * 60_000;

/**
 * Stav, jak ho vidí sám uživatel. Tichý poplach (nouzový PIN, opakovaně špatný PIN) se tu
 * NEPROJEVÍ – telefon může mít v ruce nebo před očima právě ten, kdo uživatele ohrožuje.
 */
export function ownStatus(s, now = Date.now()) {
  if (s.ended_at) return 'ended';
  if (s.sos_at) return 'sos';
  if (isOverdue(s, now)) return 'overdue';
  return 'ok';
}

/** Stav pro důvěryhodnou osobu – vidí všechno, včetně tichého poplachu. */
export function shareStatus(s, now = Date.now()) {
  if (s.ended_at && s.end_kind === 'ok') return 'ended';
  if (s.sos_at || s.silent_alarm_at) return 'alarm';
  if (s.ended_at) return 'ended';
  if (isOverdue(s, now)) return 'overdue';
  return 'ok';
}

export const activeSafetySession = (db, userId, matchId) =>
  db
    .prepare('SELECT * FROM safety_sessions WHERE user_id = ? AND match_id = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1')
    .get(userId, matchId);

export function ownSafetyView(s, publicUrl) {
  if (!s) return null;
  return {
    id: s.id,
    status: ownStatus(s),
    shareUrl: `${publicUrl}/s/${s.share_token}`,
    trustedName: s.trusted_name,
    checkInMinutes: s.check_in_minutes,
    startedAt: s.started_at,
    lastCheckInAt: s.last_check_in_at,
    nextCheckInDue: new Date(nextCheckInDue(s)).toISOString(),
    sosAt: s.sos_at,
    endedAt: s.ended_at,
  };
}

/** Co vidí protějšek: jen že bezpečnostní režim běží. Nikdy SOS, poplach ani polohu. */
export const partnerSafetyView = (s) => ({ active: !!s });

// --- moderace ---

export function addFlag(db, { userId, byUserId = null, source, reason, priority = 'normal', refId = null, details = '' }) {
  if (!userId) return;
  db.prepare(
    'INSERT INTO flags (user_id, by_user_id, source, reason, priority, ref_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(userId, byUserId, source, reason, priority, refId, details, nowIso());
}

const PATTERN_WINDOW_DAYS = 90;

/** Je člověk právě na schůzce (jako ten, kdo má bezpečnostní režim, nebo jako protějšek)? */
export function inActiveMeetup(db, userId) {
  return !!db
    .prepare('SELECT 1 FROM safety_sessions WHERE ended_at IS NULL AND (user_id = ? OR partner_id = ?)')
    .get(userId, userId);
}

/**
 * Vzorce napříč lidmi: jeden varovný signál může být omyl, stejný signál od víc různých lidí už ne.
 *  - vážné signály (poplach, nouzový PIN, nahlášení, špatné hodnocení) od 2 různých lidí → pozastavit
 *  - jakékoli signály (včetně zrušení domluvy během schůzky) od 3 různých lidí → ke kontrole
 * Pozastavení se odloží, dokud dotyčný nedokončí probíhající schůzku – nesmí poznat, že někdo spustil poplach.
 */
export function checkPattern(db, userId) {
  if (!userId) return;
  const since = new Date(Date.now() - PATTERN_WINDOW_DAYS * 86400_000).toISOString();
  const count = (sql) => db.prepare(sql).get(userId, since).n;
  const severe = count(`SELECT COUNT(DISTINCT by_user_id) AS n FROM flags WHERE user_id = ? AND created_at > ?
      AND by_user_id IS NOT NULL AND source IN ('safety', 'feedback', 'report') AND priority != 'low'`);
  const any = count(`SELECT COUNT(DISTINCT by_user_id) AS n FROM flags WHERE user_id = ? AND created_at > ?
      AND by_user_id IS NOT NULL AND source IN ('safety', 'feedback', 'report', 'revocation')`);
  if (severe < 2 && any < 3) return;
  const open = db.prepare("SELECT 1 FROM flags WHERE user_id = ? AND reason = 'pattern' AND resolved_at IS NULL").get(userId);
  if (!open) {
    addFlag(db, {
      userId,
      source: 'pattern',
      reason: 'pattern',
      priority: 'high',
      details: severe >= 2 ? 'Vážné signály od víc lidí – pozastavit' : 'Opakované signály od víc lidí – zkontrolovat',
    });
  }
  if (severe >= 2 && !inActiveMeetup(db, userId)) suspendUser(db, userId, 'Opakované varovné signály od různých lidí');
}

/** Dokončí pozastavení odložená kvůli probíhající schůzce (volá hlídač). */
export function applyDeferredSuspensions(db) {
  const rows = db
    .prepare(
      `SELECT DISTINCT f.user_id FROM flags f JOIN users u ON u.id = f.user_id
       WHERE f.reason = 'pattern' AND f.resolved_at IS NULL AND f.details LIKE '%pozastavit%' AND u.status = 'active'`,
    )
    .all();
  for (const { user_id } of rows) {
    if (!inActiveMeetup(db, user_id)) suspendUser(db, user_id, 'Opakované varovné signály od různých lidí');
  }
}

/** Pozastaví účet do ruční kontroly. Probíhající bezpečnostní režimy NEUKONČUJE. */
export function suspendUser(db, userId, reason) {
  db.prepare("UPDATE users SET status = 'suspended', status_reason = ? WHERE id = ? AND status = 'active'").run(
    reason,
    userId,
  );
}
