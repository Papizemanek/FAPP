import { CHECK_IN_GRACE_MINUTES } from '../../shared/constants.js';
import { HttpError, ageFrom, distanceKm, parseJson } from './util.js';

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
    photo: user.photo,
    tags: parseJson(user.tags, []),
    boundaries: user.boundaries,
    stiTest: user.sti_test,
    distanceKm: distance,
  };
}

export function ownProfile(user) {
  return {
    ...publicProfile(user, null),
    email: user.email,
    birthdate: user.birthdate,
    interestedIn: parseJson(user.interested_in, []),
    ageMin: user.age_min,
    ageMax: user.age_max,
    maxDistanceKm: user.max_distance_km,
    hasLocation: user.lat != null,
    trustedName: user.trusted_name,
    trustedPhone: user.trusted_phone,
  };
}

export const getUser = (db, id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

export function isBlocked(db, a, b) {
  return !!db
    .prepare(
      'SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)',
    )
    .get(a, b, b, a);
}

/** Vrátí aktivní match, ve kterém je uživatel jednou ze stran, jinak 404. */
export function getMatchFor(db, matchId, userId, { allowEnded = false } = {}) {
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(Number(matchId));
  if (!match || (match.user_a !== userId && match.user_b !== userId)) {
    throw new HttpError(404, 'Match neexistuje.');
  }
  if (match.ended_at && !allowEnded) throw new HttpError(410, 'Tenhle match už skončil.');
  const otherId = match.user_a === userId ? match.user_b : match.user_a;
  return { match, otherId };
}

// --- dohoda (souhlas) ---

export const currentAgreement = (db, matchId) =>
  db.prepare('SELECT * FROM agreements WHERE match_id = ? ORDER BY id DESC LIMIT 1').get(matchId);

export function agreementStatus(db, agreement, match) {
  if (agreement.revoked_at) return 'revoked';
  if (agreement.completed_at) return 'completed';
  const confirmations = db
    .prepare('SELECT user_id, version FROM agreement_confirmations WHERE agreement_id = ?')
    .all(agreement.id);
  const confirmedBy = (uid) => confirmations.some((c) => c.user_id === uid && c.version === agreement.version);
  return confirmedBy(match.user_a) && confirmedBy(match.user_b) ? 'confirmed' : 'pending';
}

export function agreementView(db, agreement, match, viewerId) {
  if (!agreement) return null;
  const confirmations = db
    .prepare('SELECT user_id, version, confirmed_at FROM agreement_confirmations WHERE agreement_id = ?')
    .all(agreement.id)
    .filter((c) => c.version === agreement.version);
  const otherId = match.user_a === viewerId ? match.user_b : match.user_a;
  const mine = confirmations.find((c) => c.user_id === viewerId);
  const theirs = confirmations.find((c) => c.user_id === otherId);
  return {
    id: agreement.id,
    version: agreement.version,
    status: agreementStatus(db, agreement, match),
    proposedByMe: agreement.proposed_by === viewerId,
    meetAt: agreement.meet_at,
    place: agreement.place,
    activities: parseJson(agreement.activities, []),
    activitiesNote: agreement.activities_note,
    condom: !!agreement.condom,
    sober: !!agreement.sober,
    safeword: agreement.safeword,
    boundaries: agreement.boundaries,
    safetyRequired: !!agreement.safety_required,
    confirmedByMe: mine?.confirmed_at ?? null,
    confirmedByPartner: theirs?.confirmed_at ?? null,
    revokedByMe: agreement.revoked_at ? agreement.revoked_by === viewerId : null,
    revokedAt: agreement.revoked_at,
    revokeReason: agreement.revoke_reason,
    completedAt: agreement.completed_at,
    updatedAt: agreement.updated_at,
  };
}

// --- bezpečnostní režim ---

export function safetyStatus(session, now = Date.now()) {
  if (session.ended_at) return 'ended';
  if (session.sos_at) return 'sos';
  const due = nextCheckInDue(session);
  if (now > due + CHECK_IN_GRACE_MINUTES * 60_000) return 'overdue';
  return 'ok';
}

export const nextCheckInDue = (session) =>
  Date.parse(session.last_check_in_at) + session.check_in_minutes * 60_000;

export const activeSafetySession = (db, userId, matchId) =>
  db
    .prepare(
      'SELECT * FROM safety_sessions WHERE user_id = ? AND match_id = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1',
    )
    .get(userId, matchId);

export function ownSafetyView(session) {
  if (!session) return null;
  return {
    id: session.id,
    status: safetyStatus(session),
    shareToken: session.share_token,
    shareWithPartner: !!session.share_with_partner,
    checkInMinutes: session.check_in_minutes,
    startedAt: session.started_at,
    lastCheckInAt: session.last_check_in_at,
    nextCheckInDue: new Date(nextCheckInDue(session)).toISOString(),
    sosAt: session.sos_at,
    endedAt: session.ended_at,
    location: session.lat != null ? { lat: session.lat, lng: session.lng, at: session.location_at } : null,
  };
}

/**
 * Co o bezpečnostním režimu vidí protějšek. Záměrně NEukazuje SOS ani zmeškaný check-in –
 * pokud je člověk v ohrožení právě kvůli protějšku, nesmí ho aplikace prozradit.
 */
export function partnerSafetyView(session) {
  if (!session) return { active: false };
  return {
    active: true,
    location:
      session.share_with_partner && session.lat != null
        ? { lat: session.lat, lng: session.lng, at: session.location_at }
        : null,
  };
}
