import { Router } from 'express';
import { getUser, isBlocked, publicProfile } from '../model.js';
import { notify } from '../services/push.js';
import { HttpError, ageFrom, bool, distanceKm, int, nowIso, parseJson } from '../util.js';
import { requireAuth, requireVerified } from './auth.js';

const DECK_SIZE = 20;

export function discoverRoutes({ db, config, services, limiter }) {
  const r = Router();
  const guard = [requireAuth(db), requireVerified];

  r.get('/discover', ...guard, (req, res) => {
    const me = req.user;
    if (me.lat == null) throw new HttpError(409, 'Nejdřív povol polohu, ať ti můžeme ukázat lidi v okolí.');
    if (parseJson(me.photos, []).length === 0) throw new HttpError(409, 'Přidej si aspoň jednu fotku.');

    const myAge = ageFrom(me.birthdate);
    const myInterest = parseJson(me.interested_in, []);
    const rows = db
      .prepare(
        `SELECT * FROM users u
         WHERE u.id != ? AND u.status = 'active' AND u.verification_status = 'approved'
           AND u.lat IS NOT NULL AND json_array_length(u.photos) > 0
           AND NOT EXISTS (SELECT 1 FROM swipes s WHERE s.swiper_id = ? AND s.target_id = u.id)
           AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = u.id)
                                                   OR (b.blocker_id = u.id AND b.blocked_id = ?))`,
      )
      .all(me.id, me.id, me.id, me.id);

    const deck = rows
      .map((u) => ({ u, age: ageFrom(u.birthdate), km: distanceKm(me.lat, me.lng, u.lat, u.lng) }))
      .filter(
        ({ u, age, km }) =>
          myInterest.includes(u.gender) &&
          parseJson(u.interested_in, []).includes(me.gender) &&
          age >= me.age_min &&
          age <= me.age_max &&
          myAge >= u.age_min &&
          myAge <= u.age_max &&
          km <= Math.min(me.max_distance_km, u.max_distance_km),
      )
      .sort((a, b) => a.km - b.km)
      .slice(0, DECK_SIZE)
      .map(({ u }) => publicProfile(u, me));
    res.json(deck);
  });

  r.post('/swipes', ...guard, limiter('swipe', 120), (req, res) => {
    const targetId = int(req.body?.targetId, 'targetId', { min: 1, max: Number.MAX_SAFE_INTEGER });
    const like = bool(req.body?.like);
    const target = getUser(db, targetId);
    if (!target || target.id === req.user.id || target.status !== 'active' || target.verification_status !== 'approved') {
      throw new HttpError(404, 'Profil neexistuje.');
    }
    if (isBlocked(db, req.user.id, targetId)) throw new HttpError(404, 'Profil neexistuje.');

    db.prepare('INSERT OR REPLACE INTO swipes (swiper_id, target_id, liked, created_at) VALUES (?, ?, ?, ?)').run(
      req.user.id,
      targetId,
      like ? 1 : 0,
      nowIso(),
    );
    if (!like) return res.json({ match: null });

    // Jen pro vývoj: demo profily (seed) lajkují zpátky, ať jde hned vyzkoušet match.
    if (config.dev && target.email.endsWith('@demo.fapp')) {
      db.prepare('INSERT OR IGNORE INTO swipes (swiper_id, target_id, liked, created_at) VALUES (?, ?, 1, ?)').run(
        targetId,
        req.user.id,
        nowIso(),
      );
    }

    const likedBack = db.prepare('SELECT 1 FROM swipes WHERE swiper_id = ? AND target_id = ? AND liked = 1').get(
      targetId,
      req.user.id,
    );
    if (!likedBack) return res.json({ match: null });

    const [a, b] = [req.user.id, targetId].sort((x, y) => x - y);
    const inserted = db
      .prepare('INSERT OR IGNORE INTO matches (user_a, user_b, created_at) VALUES (?, ?, ?)')
      .run(a, b, nowIso());
    const match = db.prepare('SELECT id, ended_at FROM matches WHERE user_a = ? AND user_b = ?').get(a, b);
    if (match.ended_at) return res.json({ match: null });
    if (inserted.changes > 0) {
      notify(db, services.push, targetId, {
        title: 'Je to match!',
        body: `Ty a ${req.user.name} se chcete.`,
        data: { type: 'match', matchId: match.id },
      });
    }
    res.json({ match: { id: match.id, partner: publicProfile(target, req.user) } });
  });

  return r;
}
