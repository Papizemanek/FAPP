import { Router } from 'express';
import {
  effectiveLocation,
  hasFeature,
  isActiveUntil,
  likeQuota,
  paywall,
  requireFeature,
  restrictedIds,
  useCredit,
  weeklySuperLikesLeft,
} from '../billing.js';
import { tx } from '../db.js';
import { msg } from '../i18n.js';
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
    if (me.lat == null) throw new HttpError(409, 'discover.locationRequired', { code: 'no_location' });
    if (parseJson(me.photos, []).length === 0) throw new HttpError(409, 'discover.photoRequired', { code: 'no_photo' });

    const now = Date.now();
    const myAge = ageFrom(me.birthdate);
    const myInterest = parseJson(me.interested_in, []);
    const here = effectiveLocation(me, now);
    // Kdo mě už lajkl (super lajk a prioritní lajky jdou v balíčku dopředu).
    const likedMe = new Map(
      db.prepare('SELECT swiper_id, super FROM swipes WHERE target_id = ? AND liked = 1').all(me.id).map((s) => [s.swiper_id, s.super]),
    );
    const restricted = restrictedIds(db, now);
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

    // Pořadí: super lajk → prioritní lajk (Platinum) → boost → „Dnes večer“ → vzdálenost.
    // Účtům s vážným nevyřešeným příznakem se placená viditelnost neprojeví.
    const tier = (u) => {
      if (restricted.has(u.id)) return 4;
      if (likedMe.get(u.id) === 1) return 0;
      if (likedMe.has(u.id) && hasFeature(u, 'priorityLikes', now)) return 1;
      if (isActiveUntil(u.boost_until, now)) return 2;
      if (isActiveUntil(u.tonight_until, now)) return 3;
      return 4;
    };

    const deck = rows
      .map((u) => {
        const there = effectiveLocation(u, now);
        return { u, age: ageFrom(u.birthdate), km: distanceKm(here.lat, here.lng, there.lat, there.lng), tier: tier(u) };
      })
      .filter(
        ({ u, age, km }) =>
          // Inkognito: vidí ho jen ti, které sám lajkl.
          !(u.incognito && hasFeature(u, 'incognito', now) && !likedMe.has(u.id)) &&
          myInterest.includes(u.gender) &&
          parseJson(u.interested_in, []).includes(me.gender) &&
          age >= me.age_min &&
          age <= me.age_max &&
          myAge >= u.age_min &&
          myAge <= u.age_max &&
          km <= Math.min(me.max_distance_km, u.max_distance_km),
      )
      .sort((a, b) => a.tier - b.tier || a.km - b.km)
      .slice(0, DECK_SIZE)
      .map(({ u }) => ({ ...publicProfile(u, me), superLike: likedMe.get(u.id) === 1 && !restricted.has(u.id) }));
    res.json(deck);
  });

  r.post('/swipes', ...guard, limiter('swipe', 120), (req, res) => {
    const targetId = int(req.body?.targetId, 'fields.targetId', { min: 1, max: Number.MAX_SAFE_INTEGER });
    const like = bool(req.body?.like);
    const superLike = bool(req.body?.super);
    if (superLike && !like) throw new HttpError(400, 'discover.superLikeIsLike');
    const target = getUser(db, targetId);
    if (!target || target.id === req.user.id || target.status !== 'active' || target.verification_status !== 'approved') {
      throw new HttpError(404, 'discover.profileNotFound');
    }
    if (isBlocked(db, req.user.id, targetId)) throw new HttpError(404, 'discover.profileNotFound');

    const quota = likeQuota(db, config, req.user);
    if (like && !superLike && quota.remaining === 0) {
      throw paywall('billing.likeLimit', {
        code: 'like_limit',
        resetAt: quota.resetAt,
      });
    }

    tx(db, () => {
      // Super lajk: nejdřív týdenní dávka z předplatného, pak koupené kredity.
      let superCredit = 0;
      if (superLike && weeklySuperLikesLeft(db, req.user) === 0) {
        if (!useCredit(db, req.user.id, 'superlike')) throw paywall('billing.noSuperLike', { code: 'no_credit', credit: 'superlike' });
        superCredit = 1;
      }
      db.prepare(
        'INSERT OR REPLACE INTO swipes (swiper_id, target_id, liked, created_at, super, super_credit) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(req.user.id, targetId, like ? 1 : 0, nowIso(), superLike ? 1 : 0, superCredit);
    });
    const likesLeft = quota.remaining === null ? null : like && !superLike ? quota.remaining - 1 : quota.remaining;
    if (!like) return res.json({ match: null, likesLeft });
    if (superLike) {
      // Neutrální text – notifikace může být vidět na zamčené obrazovce.
      notify(db, services.push, targetId, {
        title: msg('push.superLike.title'),
        body: msg('push.superLike.body'),
        data: { type: 'likes' },
      });
    }

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
    if (!likedBack) return res.json({ match: null, likesLeft });

    const [a, b] = [req.user.id, targetId].sort((x, y) => x - y);
    const inserted = db
      .prepare('INSERT OR IGNORE INTO matches (user_a, user_b, created_at) VALUES (?, ?, ?)')
      .run(a, b, nowIso());
    const match = db.prepare('SELECT id, ended_at FROM matches WHERE user_a = ? AND user_b = ?').get(a, b);
    if (match.ended_at) return res.json({ match: null, likesLeft });
    if (inserted.changes > 0) {
      notify(db, services.push, targetId, {
        title: msg('push.match.title'),
        body: msg('push.match.body', { name: req.user.name }),
        data: { type: 'match', matchId: match.id },
      });
    }
    res.json({ match: { id: match.id, partner: publicProfile(target, req.user) }, likesLeft });
  });

  // Vrácení posledního swipu (Plus). Super lajk ani swipe, ze kterého je match, vrátit nejde.
  r.post('/swipes/rewind', ...guard, (req, res) => {
    requireFeature(req.user, 'rewind');
    const last = db.prepare('SELECT * FROM swipes WHERE swiper_id = ? ORDER BY created_at DESC LIMIT 1').get(req.user.id);
    if (!last) throw new HttpError(404, 'discover.nothingToRewind');
    if (last.super) throw new HttpError(409, 'discover.cantRewindSuperLike');
    const [a, b] = [req.user.id, last.target_id].sort((x, y) => x - y);
    if (db.prepare('SELECT 1 FROM matches WHERE user_a = ? AND user_b = ?').get(a, b)) {
      throw new HttpError(409, 'discover.cantRewindMatch');
    }
    db.prepare('DELETE FROM swipes WHERE swiper_id = ? AND target_id = ?').run(req.user.id, last.target_id);
    const target = getUser(db, last.target_id);
    if (!target || target.status !== 'active' || isBlocked(db, req.user.id, target.id)) throw new HttpError(404, 'discover.profileGone');
    res.json({ profile: publicProfile(target, req.user) });
  });

  return r;
}
