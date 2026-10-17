import {
  BOOST_MINUTES,
  FEATURES,
  FREE_LIKES_PER_WINDOW,
  LIKES_WINDOW_HOURS,
  PLANS,
  PRODUCTS,
  TONIGHT_END_HOUR,
  TRAVEL_CITIES,
  WEEKLY_SUPER_LIKES,
} from '../../shared/constants.js';
import { msg } from './i18n.js';
import { HttpError } from './util.js';

// Předplatné a jednorázové nákupy. Bezpečnost se nikdy neprodává – tady jsou jen pohodlí a viditelnost.

const DAY = 86400_000;
const iso = (ms) => new Date(ms).toISOString();

/** Úroveň předplatného, která právě platí (users.plan je kopie z tabulky subscriptions). */
export function planOf(user, now = Date.now()) {
  if (!user.plan || user.plan === 'free' || !user.plan_expires_at) return 'free';
  return Date.parse(user.plan_expires_at) > now ? user.plan : 'free';
}

export const hasFeature = (user, feature, now = Date.now()) =>
  PLANS[planOf(user, now)].rank >= PLANS[FEATURES[feature].plan].rank;

export const isActiveUntil = (value, now = Date.now()) => !!value && Date.parse(value) > now;

/** Poloha pro výpočet vzdálenosti: „Na cestách“ (jen s předplatným), jinak zaokrouhlený domov. */
export function effectiveLocation(user, now = Date.now()) {
  if (user.travel_city && Object.hasOwn(TRAVEL_CITIES, user.travel_city) && hasFeature(user, 'travel', now)) {
    const city = TRAVEL_CITIES[user.travel_city];
    return { lat: city.lat, lng: city.lng, traveling: true };
  }
  return { lat: user.lat, lng: user.lng, traveling: false };
}

/** Chyba „tohle je placené“ – aplikace na ni otevře nabídku předplatného. key = překladový klíč. */
export function paywall(key, data) {
  return new HttpError(402, key, data);
}

export function requireFeature(user, feature) {
  if (!hasFeature(user, feature)) {
    const plan = FEATURES[feature].plan;
    // Název úrovně (Plus, Gold, Platinum) je obchodní značka a nepřekládá se.
    throw paywall('billing.featureInPlan', {
      code: 'upgrade',
      plan,
      params: { feature: msg(`features.${feature}`), plan: PLANS[plan].name },
    });
  }
}

/** Přepočítá aktuální úroveň z tabulky předplatných: nejvyšší platná vyhrává. */
export function refreshPlan(db, userId, now = Date.now()) {
  const subs = db
    .prepare('SELECT plan, expires_at FROM subscriptions WHERE user_id = ? AND expires_at > ?')
    .all(userId, iso(now))
    .filter((s) => Object.hasOwn(PLANS, s.plan));
  subs.sort((a, b) => PLANS[b.plan].rank - PLANS[a.plan].rank || b.expires_at.localeCompare(a.expires_at));
  const best = subs[0];
  db.prepare('UPDATE users SET plan = ?, plan_expires_at = ? WHERE id = ?').run(best?.plan ?? 'free', best?.expires_at ?? null, userId);
}

/** Hlídač: po vypršení vyšší úrovně může dál platit nižší (např. Gold skončil, Plus běží). */
export function refreshExpiredPlans(db, now = Date.now()) {
  const ids = db.prepare("SELECT id FROM users WHERE plan != 'free' AND (plan_expires_at IS NULL OR plan_expires_at <= ?)").all(iso(now));
  for (const { id } of ids) refreshPlan(db, id, now);
}

// Účet s vážným nevyřešeným příznakem (vysoká priorita nebo vzorec chování) si nekoupí viditelnost
// a jeho super lajky, prioritní lajky a boost se neprojeví. Bezpečnost má přednost před tržbami.
const RESTRICTED_SQL = `SELECT DISTINCT user_id FROM flags
  WHERE resolved_at IS NULL AND created_at > ? AND (priority = 'high' OR source = 'pattern')`;

export function restrictedIds(db, now = Date.now()) {
  return new Set(db.prepare(RESTRICTED_SQL).all(iso(now - 90 * DAY)).map((r) => r.user_id));
}

export function isRestricted(db, user, now = Date.now()) {
  if (user.status !== 'active') return true;
  return !!db.prepare(`${RESTRICTED_SQL} AND user_id = ?`).get(iso(now - 90 * DAY), user.id);
}

/** Limit lajků zdarma: 50 za klouzavých 12 hodin. Ve free režimu (start) a s předplatným bez limitu. */
export function likeQuota(db, config, user, now = Date.now()) {
  if (config.billingMode !== 'paid' || hasFeature(user, 'unlimitedLikes', now)) {
    return { limit: null, used: 0, remaining: null, resetAt: null };
  }
  const windowMs = LIKES_WINDOW_HOURS * 3600_000;
  const rows = db
    .prepare('SELECT created_at FROM swipes WHERE swiper_id = ? AND liked = 1 AND super = 0 AND created_at > ? ORDER BY created_at')
    .all(user.id, iso(now - windowMs));
  const used = rows.length;
  const remaining = Math.max(0, FREE_LIKES_PER_WINDOW - used);
  // Další lajk se uvolní, až z okna vypadne ten nejstarší, který je „navíc“.
  const resetAt = remaining === 0 ? iso(Date.parse(rows[used - FREE_LIKES_PER_WINDOW].created_at) + windowMs) : null;
  return { limit: FREE_LIKES_PER_WINDOW, used, remaining, resetAt };
}

export const creditBalance = (db, userId, kind) =>
  db.prepare('SELECT balance FROM credits WHERE user_id = ? AND kind = ?').get(userId, kind)?.balance ?? 0;

export function addCredits(db, userId, kind, amount) {
  db.prepare(
    `INSERT INTO credits (user_id, kind, balance) VALUES (?, ?, ?)
     ON CONFLICT (user_id, kind) DO UPDATE SET balance = balance + excluded.balance`,
  ).run(userId, kind, amount);
}

export function useCredit(db, userId, kind) {
  return db.prepare('UPDATE credits SET balance = balance - 1 WHERE user_id = ? AND kind = ? AND balance > 0').run(userId, kind).changes > 0;
}

export function weeklySuperLikesLeft(db, user, now = Date.now()) {
  if (!hasFeature(user, 'weeklySuperLikes', now)) return 0;
  const used = db
    .prepare('SELECT COUNT(*) AS n FROM swipes WHERE swiper_id = ? AND super = 1 AND super_credit = 0 AND created_at > ?')
    .get(user.id, iso(now - 7 * DAY)).n;
  return Math.max(0, WEEKLY_SUPER_LIKES - used);
}

export function monthlyBoostLeft(db, user, now = Date.now()) {
  if (!hasFeature(user, 'monthlyBoost', now)) return 0;
  const used = db.prepare('SELECT COUNT(*) AS n FROM boosts WHERE user_id = ? AND from_plan = 1 AND started_at > ?').get(user.id, iso(now - 30 * DAY)).n;
  return used > 0 ? 0 : 1;
}

/** Konec „Dnes večer“: nejbližší 6:00 pražského času. */
export function tonightEnd(now = Date.now()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' })
      .formatToParts(new Date(now))
      .map((p) => [p.type, Number(p.value)]),
  );
  const minutesNow = parts.hour * 60 + parts.minute;
  let minutesLeft = (TONIGHT_END_HOUR * 60 - minutesNow + 1440) % 1440;
  if (minutesLeft === 0) minutesLeft = 1440;
  return iso(now + minutesLeft * 60_000 - parts.second * 1000);
}

export const boostEnd = (now = Date.now()) => iso(now + BOOST_MINUTES * 60_000);

const addMonths = (now, months) => {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
};

/** ID produktu z obchodu → náš produkt („fapp_gold_1m“, Google „gold_1m:mesicne“ → „gold_1m“). */
export function productIdFrom(storeId) {
  const base = String(storeId ?? '')
    .split(':')[0]
    .replace(/^fapp[._]/, '');
  return Object.hasOwn(PRODUCTS, base) ? base : null;
}

/**
 * Připíše nákup. Předplatné se páruje podle original_transaction_id (obnovy prodlužují stejný řádek),
 * jednorázové nákupy podle transaction_id, takže opakovaně doručený webhook nic nepřipíše dvakrát.
 */
export function grantProduct(db, userId, productId, { source, transactionId = null, expiresAt = null, now = Date.now() }) {
  const product = PRODUCTS[productId];
  const stamp = iso(now);
  if (product.kind === 'plan') {
    const expires = expiresAt ?? addMonths(now, product.months);
    const existing = transactionId && db.prepare('SELECT id FROM subscriptions WHERE original_transaction_id = ?').get(transactionId);
    if (existing) {
      db.prepare('UPDATE subscriptions SET plan = ?, product_id = ?, expires_at = ?, cancelled_at = NULL, updated_at = ? WHERE id = ?').run(
        product.plan,
        productId,
        expires,
        stamp,
        existing.id,
      );
    } else {
      db.prepare(
        `INSERT INTO subscriptions (user_id, plan, product_id, source, original_transaction_id, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(userId, product.plan, productId, source, transactionId, expires, stamp, stamp);
    }
    refreshPlan(db, userId, now);
    return;
  }
  const inserted = db
    .prepare('INSERT OR IGNORE INTO purchases (user_id, product_id, source, transaction_id, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(userId, productId, source, transactionId, stamp);
  if (inserted.changes > 0) addCredits(db, userId, product.credit, product.amount);
}

/** Co aplikace potřebuje vědět o předplatném. Příznaky moderace se tu záměrně neukazují. */
export function billingStatus(db, config, user, now = Date.now()) {
  const plan = planOf(user, now);
  const features = Object.fromEntries(Object.keys(FEATURES).map((f) => [f, hasFeature(user, f, now)]));
  return {
    mode: config.billingMode,
    canPurchase: config.billingMode === 'paid',
    provider: config.paymentsProvider,
    plan,
    planExpiresAt: plan === 'free' ? null : user.plan_expires_at,
    features,
    likes: likeQuota(db, config, user, now),
    superLikes: { weeklyLeft: weeklySuperLikesLeft(db, user, now), credits: creditBalance(db, user.id, 'superlike') },
    boost: {
      activeUntil: isActiveUntil(user.boost_until, now) ? user.boost_until : null,
      monthlyLeft: monthlyBoostLeft(db, user, now),
      credits: creditBalance(db, user.id, 'boost'),
    },
    tonight: {
      activeUntil: isActiveUntil(user.tonight_until, now) ? user.tonight_until : null,
      included: features.tonight,
      credits: creditBalance(db, user.id, 'tonight'),
    },
    incognito: !!user.incognito && features.incognito,
    travelCity: features.travel && user.travel_city ? user.travel_city : null,
  };
}
