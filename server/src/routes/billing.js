import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { PRODUCTS, SENT_LIKES_DAYS, TRAVEL_CITIES } from '../../../shared/constants.js';
import {
  billingStatus,
  boostEnd,
  grantProduct,
  hasFeature,
  isActiveUntil,
  isRestricted,
  monthlyBoostLeft,
  paywall,
  productIdFrom,
  refreshPlan,
  requireFeature,
  restrictedIds,
  tonightEnd,
  useCredit,
} from '../billing.js';
import { tx } from '../db.js';
import { getUser, publicProfile } from '../model.js';
import { HttpError, nowIso } from '../util.js';
import { requireAuth, requireVerified } from './auth.js';

// Předplatné, jednorázové nákupy a placené funkce (kdo tě lajkl, boost, Dnes večer, inkognito, na cestách).

const PLAN_EVENTS = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'SUBSCRIPTION_EXTENDED']);

const safeEqual = (a, b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function billingRoutes({ db, config }) {
  const r = Router();
  const guard = [requireAuth(db), requireVerified];
  const status = (userId) => billingStatus(db, config, getUser(db, userId));

  r.get('/billing', ...guard, (req, res) => {
    if (req.user.plan !== 'free') refreshPlan(db, req.user.id);
    res.json(status(req.user.id));
  });

  // Nákup bez platby – jen pro vývoj a webový prototyp. V produkci kupuje aplikace přes obchod a server
  // se o nákupu dozví z webhooku RevenueCatu.
  r.post('/billing/purchase', ...guard, (req, res) => {
    if (config.paymentsProvider !== 'dev') throw new HttpError(404, 'Nenalezeno.');
    if (config.billingMode !== 'paid') throw new HttpError(403, 'Platby zatím nejsou zapnuté – F*app je teď celý zdarma.');
    const productId = String(req.body?.productId ?? '');
    if (!Object.hasOwn(PRODUCTS, productId)) throw new HttpError(400, 'Neznámý produkt.');
    if (PRODUCTS[productId].kind === 'credit' && isRestricted(db, req.user)) throw new HttpError(403, 'Tohle teď koupit nejde.');
    grantProduct(db, req.user.id, productId, { source: 'dev' });
    res.json(status(req.user.id));
  });

  // Webhook RevenueCatu (App Store + Google Play). app_user_id = naše ID uživatele (aplikace volá Purchases.logIn).
  r.post('/billing/webhook/revenuecat', (req, res) => {
    const expected = config.revenuecat.webhookAuth;
    if (!expected || !safeEqual(req.get('authorization') ?? '', expected)) throw new HttpError(401, 'Neautorizováno.');
    const e = req.body?.event ?? {};
    const userId = Number(e.app_user_id);
    const user = Number.isSafeInteger(userId) && userId > 0 ? getUser(db, userId) : null;
    const productId = productIdFrom(e.product_id);
    // Neznámý uživatel nebo produkt: potvrdit, ať RevenueCat nezkouší doručovat donekonečna.
    if (!user || !productId) return res.json({ ok: true, ignored: true });

    const product = PRODUCTS[productId];
    const original = String(e.original_transaction_id ?? e.transaction_id ?? e.id ?? '');
    tx(db, () => {
      if (product.kind === 'plan' && PLAN_EVENTS.has(e.type)) {
        const expiresAt = Number.isFinite(e.expiration_at_ms) ? new Date(e.expiration_at_ms).toISOString() : null;
        grantProduct(db, user.id, productId, { source: 'store', transactionId: original || null, expiresAt });
      } else if (product.kind === 'plan' && e.type === 'CANCELLATION') {
        // Zrušené předplatné platí do konce zaplaceného období.
        db.prepare('UPDATE subscriptions SET cancelled_at = ?, updated_at = ? WHERE original_transaction_id = ?').run(nowIso(), nowIso(), original);
      } else if (product.kind === 'plan' && e.type === 'EXPIRATION') {
        db.prepare('UPDATE subscriptions SET expires_at = MIN(expires_at, ?), updated_at = ? WHERE original_transaction_id = ?').run(
          nowIso(),
          nowIso(),
          original,
        );
        refreshPlan(db, user.id);
      } else if (product.kind === 'credit' && ['NON_RENEWING_PURCHASE', 'INITIAL_PURCHASE'].includes(e.type)) {
        grantProduct(db, user.id, productId, { source: 'store', transactionId: String(e.transaction_id ?? e.id ?? original) });
      }
    });
    res.json({ ok: true });
  });

  // Boost: 30 minut nahoře u lidí v okolí. Gold a Platinum mají 1 měsíčně, jinak z koupených kreditů.
  r.post('/billing/boost', ...guard, (req, res) => {
    const me = req.user;
    if (isRestricted(db, me)) throw new HttpError(403, 'Boost teď spustit nejde.');
    if (isActiveUntil(me.boost_until)) throw new HttpError(409, 'Boost už běží.');
    tx(db, () => {
      const fromPlan = monthlyBoostLeft(db, me) > 0;
      if (!fromPlan && !useCredit(db, me.id, 'boost')) throw paywall('Nemáš žádný boost.', { code: 'no_credit', credit: 'boost' });
      db.prepare('INSERT INTO boosts (user_id, from_plan, started_at) VALUES (?, ?, ?)').run(me.id, fromPlan ? 1 : 0, nowIso());
      db.prepare('UPDATE users SET boost_until = ? WHERE id = ?').run(boostEnd(), me.id);
    });
    res.json(status(me.id));
  });

  // „Dnes večer“: do 6:00 ráno jsi u lidí v okolí výš a se štítkem. V Platinum kdykoli, jinak za kredit.
  r.post('/billing/tonight', ...guard, (req, res) => {
    const me = req.user;
    if (isRestricted(db, me)) throw new HttpError(403, 'Tohle teď zapnout nejde.');
    if (isActiveUntil(me.tonight_until)) throw new HttpError(409, 'Dnes večer už máš zapnuté.');
    tx(db, () => {
      if (!hasFeature(me, 'tonight') && !useCredit(db, me.id, 'tonight')) {
        throw paywall('„Dnes večer“ je v Platinum nebo jednorázově.', { code: 'no_credit', credit: 'tonight' });
      }
      db.prepare('UPDATE users SET tonight_until = ? WHERE id = ?').run(tonightEnd(), me.id);
    });
    res.json(status(me.id));
  });

  r.delete('/billing/tonight', ...guard, (req, res) => {
    db.prepare('UPDATE users SET tonight_until = NULL WHERE id = ?').run(req.user.id);
    res.json(status(req.user.id));
  });

  // Inkognito a „Na cestách“. Vypnout jde vždycky, zapnout jen s předplatným.
  r.put('/billing/settings', ...guard, (req, res) => {
    const me = req.user;
    const { incognito, travelCity } = req.body ?? {};
    if (incognito !== undefined) {
      if (incognito === true) requireFeature(me, 'incognito');
      db.prepare('UPDATE users SET incognito = ? WHERE id = ?').run(incognito === true ? 1 : 0, me.id);
    }
    if (travelCity !== undefined) {
      if (travelCity === null || travelCity === '') {
        db.prepare('UPDATE users SET travel_city = NULL WHERE id = ?').run(me.id);
      } else {
        if (typeof travelCity !== 'string' || !Object.hasOwn(TRAVEL_CITIES, travelCity)) throw new HttpError(400, 'Neznámé město.');
        requireFeature(me, 'travel');
        db.prepare('UPDATE users SET travel_city = ? WHERE id = ?').run(travelCity, me.id);
      }
    }
    res.json(status(me.id));
  });

  const notBlocked = `NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = :me AND b.blocked_id = u.id)
                                                  OR (b.blocker_id = u.id AND b.blocked_id = :me))`;

  // Kdo tě lajkl: počet vidí každý, profily jen Gold a Platinum. Fotky se bez předplatného vůbec neposílají.
  r.get('/likes', ...guard, (req, res) => {
    const me = req.user;
    const where = `s.target_id = :me AND s.liked = 1 AND u.status = 'active' AND u.verification_status = 'approved'
      AND NOT EXISTS (SELECT 1 FROM swipes m WHERE m.swiper_id = :me AND m.target_id = u.id) AND ${notBlocked}`;
    const { n } = db.prepare(`SELECT COUNT(*) AS n FROM swipes s JOIN users u ON u.id = s.swiper_id WHERE ${where}`).get({ me: me.id });
    if (!hasFeature(me, 'seeLikes')) return res.json({ count: n, profiles: [] });
    const restricted = restrictedIds(db);
    const rows = db
      .prepare(`SELECT u.*, s.super AS super_like FROM swipes s JOIN users u ON u.id = s.swiper_id WHERE ${where}
                ORDER BY s.super DESC, s.created_at DESC LIMIT 100`)
      .all({ me: me.id });
    res.json({
      count: n,
      profiles: rows.map((u) => ({ ...publicProfile(u, me), superLike: u.super_like === 1 && !restricted.has(u.id) })),
    });
  });

  // Odeslané lajky za posledních 7 dní, ze kterých zatím není match (Platinum).
  r.get('/likes/sent', ...guard, (req, res) => {
    const me = req.user;
    requireFeature(me, 'sentLikes');
    const since = new Date(Date.now() - SENT_LIKES_DAYS * 86400_000).toISOString();
    const rows = db
      .prepare(
        `SELECT u.*, s.super AS super_like FROM swipes s JOIN users u ON u.id = s.target_id
         WHERE s.swiper_id = :me AND s.liked = 1 AND s.created_at > :since AND u.status = 'active'
           AND NOT EXISTS (SELECT 1 FROM swipes back WHERE back.swiper_id = u.id AND back.target_id = :me AND back.liked = 1)
           AND ${notBlocked}
         ORDER BY s.created_at DESC LIMIT 100`,
      )
      .all({ me: me.id, since });
    res.json(rows.map((u) => ({ ...publicProfile(u, me), superLike: u.super_like === 1 })));
  });

  return r;
}
