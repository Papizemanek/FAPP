import { Router } from 'express';
import { GENDERS, MAX_PROFILE_PHOTOS, MIN_AGE, TAGS, TAG_GROUP, YES_GROUPS } from '../../../shared/constants.js';
import { msg } from '../i18n.js';
import { saveImage } from '../images.js';
import { getUser, ownProfile } from '../model.js';
import { moderate } from '../services/moderation.js';
import {
  HttpError,
  bool,
  hashSecret,
  int,
  listOf,
  nowIso,
  num,
  oneOf,
  parseJson,
  phone,
  pin,
  snapToGrid,
  str,
  verifySecret,
} from '../util.js';
import { requireAuth } from './auth.js';

// Štítky „Moje ano*“: každá skupina má svůj limit (naladění jen jedno, záměr nejvýš dva…).
function yesTags(value) {
  const tags = listOf(value, 'fields.tags', TAGS);
  for (const [group, { max }] of Object.entries(YES_GROUPS)) {
    if (tags.filter((tag) => TAG_GROUP[tag] === group).length > max) {
      throw new HttpError(400, 'profile.tooManyYes', { params: { group: msg(`yesGroups.${group}`), count: max } });
    }
  }
  return tags;
}

export function profileRoutes({ db }) {
  const r = Router();
  r.use(requireAuth(db, { allowSuspended: true }));

  const me = (req) => getUser(db, req.user.id);
  const requirePassword = (req) => {
    if (!verifySecret(req.body?.password, req.user.password_hash)) throw new HttpError(403, 'profile.wrongPassword');
  };

  r.get('/', (req, res) => res.json(ownProfile(req.user)));

  r.put('/', (req, res) => {
    const b = req.body ?? {};
    const ageMin = int(b.ageMin, 'fields.ageMin', { min: MIN_AGE, max: 99 });
    const ageMax = int(b.ageMax, 'fields.ageMax', { min: MIN_AGE, max: 99 });
    if (ageMin > ageMax) throw new HttpError(400, 'profile.ageRange');
    const bio = str(b.bio, 'fields.bio', { max: 500, optional: true });
    const verdict = moderate(bio);
    if (verdict.action === 'block') throw new HttpError(400, verdict.messageKey);

    const fields = {
      name: str(b.name, 'fields.name', { min: 2, max: 40 }),
      bio,
      gender: oneOf(b.gender, 'fields.gender', GENDERS),
      interested_in: JSON.stringify(listOf(b.interestedIn, 'fields.interestedIn', GENDERS, { min: 1 })),
      tags: JSON.stringify(yesTags(b.tags ?? [])),
      age_min: ageMin,
      age_max: ageMax,
      max_distance_km: int(b.maxDistanceKm, 'fields.maxDistance', { min: 1, max: 300 }),
    };
    const columns = Object.keys(fields);
    db.prepare(`UPDATE users SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(
      ...columns.map((c) => fields[c]),
      req.user.id,
    );
    res.json(ownProfile(me(req)));
  });

  // Poloha pro hledání v okolí – jen zaokrouhlená na mřížku ~1 km.
  r.put('/location', (req, res) => {
    const lat = snapToGrid(num(req.body?.lat, 'fields.lat', { min: -90, max: 90 }));
    const lng = snapToGrid(num(req.body?.lng, 'fields.lng', { min: -180, max: 180 }));
    db.prepare('UPDATE users SET lat = ?, lng = ? WHERE id = ?').run(lat, lng, req.user.id);
    res.json(ownProfile(me(req)));
  });

  r.post('/photos', (req, res) => {
    const photos = parseJson(req.user.photos, []);
    if (photos.length >= MAX_PROFILE_PHOTOS) throw new HttpError(400, 'profile.maxPhotos', { params: { count: MAX_PROFILE_PHOTOS } });
    const id = saveImage(db, { ownerId: req.user.id, kind: 'profile', base64: req.body?.jpegBase64 });
    db.prepare('UPDATE users SET photos = ? WHERE id = ?').run(JSON.stringify([...photos, id]), req.user.id);
    res.status(201).json(ownProfile(me(req)));
  });

  r.delete('/photos/:id', (req, res) => {
    const photos = parseJson(req.user.photos, []).filter((p) => p !== req.params.id);
    db.prepare('UPDATE users SET photos = ? WHERE id = ?').run(JSON.stringify(photos), req.user.id);
    db.prepare("DELETE FROM images WHERE id = ? AND owner_id = ? AND kind = 'profile'").run(req.params.id, req.user.id);
    res.json(ownProfile(me(req)));
  });

  // Bezpečnostní nastavení. Změna PINů vyžaduje heslo – aby je nemohl přenastavit
  // někdo, kdo se zmocní odemčeného telefonu.
  r.put('/safety', (req, res) => {
    const b = req.body ?? {};
    const updates = {
      trusted_name: str(b.trustedName, 'fields.trustedName', { min: 2, max: 40 }),
      trusted_phone: phone(b.trustedPhone, 'fields.trustedPhone'),
      discreet: bool(b.discreet) ? 1 : 0,
    };
    if (b.checkinPin !== undefined || b.duressPin !== undefined) {
      if (req.user.checkin_pin_hash) requirePassword(req);
      const checkin = pin(b.checkinPin, 'fields.pin');
      const duress = pin(b.duressPin, 'fields.duressPin');
      if (checkin === duress) throw new HttpError(400, 'profile.pinsMustDiffer');
      updates.checkin_pin_hash = hashSecret(checkin);
      updates.duress_pin_hash = hashSecret(duress);
    }
    const columns = Object.keys(updates);
    db.prepare(`UPDATE users SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(
      ...columns.map((c) => updates[c]),
      req.user.id,
    );
    res.json(ownProfile(me(req)));
  });

  r.delete('/', (req, res) => {
    requirePassword(req);
    // Ani protějšek nesmí smazáním účtu „uklidit“ schůzku, při které má druhý zapnutý bezpečnostní režim.
    const active = db
      .prepare(
        `SELECT 1 FROM safety_sessions s LEFT JOIN matches m ON m.id = s.match_id
         WHERE s.ended_at IS NULL AND (s.user_id = ? OR m.user_a = ? OR m.user_b = ?)`,
      )
      .get(req.user.id, req.user.id, req.user.id);
    if (active) throw new HttpError(409, 'profile.deleteDuringMeetup');
    // Smazáním pozastaveného účtu se nejde vyhnout kontrole – osoba se nemůže znovu zaregistrovat.
    if (req.user.status !== 'active') {
      const ban = db.prepare('INSERT OR IGNORE INTO banned_identities (hash, reason, created_at) VALUES (?, ?, ?)');
      for (const hash of [req.user.person_hash, req.user.document_hash].filter(Boolean)) {
        ban.run(hash, 'Účet smazán během kontroly', nowIso());
      }
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
    res.status(204).end();
  });

  return r;
}
