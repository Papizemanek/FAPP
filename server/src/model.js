import { CHECK_IN_GRACE_MINUTES } from '../../shared/constants.js';
import { imageUrl } from './images.js';
import { HttpError, ageFrom, distanceKm, nowIso, parseJson } from './util.js';

// Dohoda je „proběhlá“ 12 hodin po plánovaném začátku schůzky.
const AGREEMENT_PAST_AFTER_MS = 12 * 3600_000;

export const getUser = (db, id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

export function publicProfile(user, viewer) {
  let distance = null;
  if (viewer && viewer.lat != null && user.lat != null) {
    distance = Math.max(1, Math.round(distanceKm(viewer.lat, viewer.lng, user.lat, user.lng)));
  }
  return {
    id: user.id,
    name: user.name,
    age: ageFrom(user.birthdate),
    gender: user.gender,
    bio: user.bio,
    photos: parseJson(user.photos, []).map(imageUrl),
    tags: parseJson(user.tags, []),
    verified: user.verification_status === 'approved',
    distanceKm: distance,
  };
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
    throw new HttpError(404, 'Match neexistuje.');
  }
  if (match.ended_at && !allowEnded) throw new HttpError(410, 'Tenhle match už skončil.');
  const otherId = match.user_a === userId ? match.user_b : match.user_a;
  return { match, otherId, other: getUser(db, otherId) };
}

export function requireActivePartner(other) {
  if (!other || other.status !== 'active') throw new HttpError(410, 'Tenhle profil už není dostupný.');
}

// --- dohoda (souhlas) ---

export const currentAgreement = (db, matchId) =>
  db.prepare('SELECT * FROM agreements WHERE match_id = ? ORDER BY id DESC LIMIT 1').get(matchId);

function confirmationsFor(db, agreement) {
  return db
    .prepare('SELECT user_id, version, confirmed_at FROM agreement_confirmations WHERE agreement_id = ?')
    .all(agreement.id)
    .filter((c) => c.version === agreement.version);
}

export function isFullyConfirmed(db, agreement, match) {
  const c = confirmationsFor(db, agreement);
  return [match.user_a, match.user_b].every((uid) => c.some((x) => x.user_id === uid));
}

export function agreementStatus(db, agreement, match, now = Date.now()) {
  if (agreement.revoked_at) return 'revoked';
  const confirmed = isFullyConfirmed(db, agreement, match);
  if (Date.parse(agreement.meet_at) + AGREEMENT_PAST_AFTER_MS < now) return confirmed ? 'past' : 'expired';
  return confirmed ? 'confirmed' : 'pending';
}

export function agreementView(db, agreement, match, viewerId, open) {
  if (!agreement) return null;
  const confirmations = confirmationsFor(db, agreement);
  const otherId = match.user_a === viewerId ? match.user_b : match.user_a;
  return {
    id: agreement.id,
    version: agreement.version,
    status: agreementStatus(db, agreement, match),
    proposedByMe: agreement.proposed_by === viewerId,
    meetAt: agreement.meet_at,
    place: agreement.place,
    activities: parseJson(agreement.activities, []),
    note: open(agreement.note),
    condom: !!agreement.condom,
    sober: !!agreement.sober,
    safeword: open(agreement.safeword),
    confirmedByMe: confirmations.find((c) => c.user_id === viewerId)?.confirmed_at ?? null,
    confirmedByPartner: confirmations.find((c) => c.user_id === otherId)?.confirmed_at ?? null,
    revokedByMe: agreement.revoked_at ? agreement.revoked_by === viewerId : null,
    revokedAt: agreement.revoked_at,
    updatedAt: agreement.updated_at,
  };
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

export function addFlag(db, { userId, source, reason, priority = 'normal', refId = null, details = '' }) {
  db.prepare(
    'INSERT INTO flags (user_id, source, reason, priority, ref_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(userId, source, reason, priority, refId, details, nowIso());
}

/** Pozastaví účet do ruční kontroly. Probíhající bezpečnostní režimy NEUKONČUJE. */
export function suspendUser(db, userId, reason) {
  db.prepare("UPDATE users SET status = 'suspended', status_reason = ? WHERE id = ? AND status = 'active'").run(
    reason,
    userId,
  );
}
