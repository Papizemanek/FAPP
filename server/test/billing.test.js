import assert from 'node:assert/strict';
import { after, afterEach, before, describe, test } from 'node:test';
import { FREE_LIKES_PER_WINDOW, WEEKLY_SUPER_LIKES } from '../../shared/constants.js';
import { refreshExpiredPlans, tonightEnd } from '../src/billing.js';
import { addFlag } from '../src/model.js';
import { startTestServer } from './helpers.js';

let t;
before(async () => {
  t = await startTestServer();
});
after(() => t.close());

const admin = { authorization: 'Bearer dev-admin' };
const billing = async (u) => (await t.call('GET', '/api/billing', { token: u.token })).body;
const buy = (u, productId) => t.call('POST', '/api/billing/purchase', { token: u.token, body: { productId } });
const like = (u, target, extra = {}) => t.call('POST', '/api/swipes', { token: u.token, body: { targetId: target.id, like: true, ...extra } });
const pass = (u, target) => t.call('POST', '/api/swipes', { token: u.token, body: { targetId: target.id, like: false } });
const deck = async (u) => (await t.call('GET', '/api/discover', { token: u.token })).body;

// Každý test má vlastní „město“, ať se balíčky lidí z různých testů nemíchají.
let city = 0;
const place = () => {
  city += 1;
  return { lat: 40 + city * 0.8, lng: -5 + city * 0.8 };
};
const people = (n, at) => Promise.all(Array.from({ length: n }, () => t.makeUser(at)));

/** Uživatelé jen v databázi – na nasimulování spousty lajků bez stovek požadavků. */
function dbUsers(n) {
  const insert = t.db.prepare(
    "INSERT INTO users (email, password_hash, name, birthdate, gender, created_at) VALUES (?, 'x', 'Db', '1990-01-01', 'man', ?)",
  );
  return Array.from({ length: n }, (_, i) => Number(insert.run(`db${Date.now()}-${i}-${Math.random()}@x.cz`, new Date().toISOString()).lastInsertRowid));
}

const paid = () => {
  t.ctx.config.billingMode = 'paid';
};
afterEach(() => {
  t.ctx.config.billingMode = 'free';
});

describe('start zdarma (free režim)', () => {
  test('lajky bez limitu, nic se neprodává, placené funkce zavřené', async () => {
    const at = place();
    const [a, b] = await people(2, at);
    const status = await billing(a);
    assert.equal(status.mode, 'free');
    assert.equal(status.plan, 'free');
    assert.equal(status.canPurchase, false);
    assert.equal(status.likes.limit, null);

    const swipe = t.db.prepare('INSERT INTO swipes (swiper_id, target_id, liked, created_at) VALUES (?, ?, 1, ?)');
    for (const id of dbUsers(FREE_LIKES_PER_WINDOW + 5)) swipe.run(a.id, id, new Date().toISOString());
    const res = await like(a, b);
    assert.equal(res.status, 200);
    assert.equal(res.body.likesLeft, null);

    assert.equal((await buy(a, 'plus_1m')).status, 403);
    assert.equal((await t.call('POST', '/api/swipes/rewind', { token: a.token })).status, 402);
    const boost = await t.call('POST', '/api/billing/boost', { token: a.token });
    assert.equal(boost.status, 402);
    assert.equal(boost.body.code, 'no_credit');
  });

  test('darované předplatné od admina platí i ve free režimu', async () => {
    const [a] = await people(1, place());
    const res = await t.call('POST', `/api/admin/users/${a.id}/plan`, { headers: admin, body: { plan: 'gold', days: 30 } });
    assert.equal(res.body.plan, 'gold');
    const status = await billing(a);
    assert.equal(status.plan, 'gold');
    assert.equal(status.features.seeLikes, true);
    assert.equal(status.superLikes.weeklyLeft, WEEKLY_SUPER_LIKES);

    await t.call('POST', `/api/admin/users/${a.id}/plan`, { headers: admin, body: { plan: 'free' } });
    assert.equal((await billing(a)).plan, 'free');
  });
});

describe('placený režim', () => {
  test('zdarma 50 lajků za 12 hodin, pak nabídka Plus; s Plus bez limitu', async () => {
    paid();
    const [a, b] = await people(2, place());
    const swipe = t.db.prepare('INSERT INTO swipes (swiper_id, target_id, liked, created_at) VALUES (?, ?, 1, ?)');
    const oldest = new Date(Date.now() - 3 * 3600_000).toISOString();
    for (const id of dbUsers(FREE_LIKES_PER_WINDOW)) swipe.run(a.id, id, oldest);

    const status = await billing(a);
    assert.equal(status.likes.remaining, 0);
    const blocked = await like(a, b);
    assert.equal(blocked.status, 402);
    assert.equal(blocked.body.code, 'like_limit');
    assert.equal(Date.parse(blocked.body.resetAt), Date.parse(oldest) + 12 * 3600_000);
    // Odmítnout jde dál.
    assert.equal((await pass(a, b)).status, 200);

    assert.equal((await buy(a, 'plus_1m')).body.plan, 'plus');
    const ok = await like(a, b);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.likesLeft, null);
  });

  test('vrácení swipu s Plus – ne u super lajku ani u matche', async () => {
    paid();
    const [a, b, c] = await people(3, place());
    await pass(a, b);
    const noPlan = await t.call('POST', '/api/swipes/rewind', { token: a.token });
    assert.equal(noPlan.status, 402);
    assert.equal(noPlan.body.plan, 'plus');

    await buy(a, 'plus_1m');
    const back = await t.call('POST', '/api/swipes/rewind', { token: a.token });
    assert.equal(back.status, 200);
    assert.equal(back.body.profile.id, b.id);
    assert.ok((await deck(a)).some((p) => p.id === b.id));

    await like(c, a);
    await like(a, c);
    assert.equal((await t.call('POST', '/api/swipes/rewind', { token: a.token })).status, 409);
  });

  test('super lajk: bez kreditu nabídka, koupený jde, příjemce ho má v balíčku první', async () => {
    paid();
    const at = place();
    const [a, b] = await people(2, at);
    const none = await like(a, b, { super: true });
    assert.equal(none.status, 402);
    assert.equal(none.body.credit, 'superlike');

    assert.equal((await buy(a, 'superlike_1')).body.superLikes.credits, 1);
    assert.equal((await like(a, b, { super: true })).status, 200);
    assert.equal((await billing(a)).superLikes.credits, 0);

    const first = (await deck(b))[0];
    assert.equal(first.id, a.id);
    assert.equal(first.superLike, true);
  });

  test('Gold: 5 super lajků týdně a 1 boost měsíčně', async () => {
    paid();
    const at = place();
    const [a, ...others] = await people(7, at);
    await buy(a, 'gold_1m');
    for (const o of others.slice(0, WEEKLY_SUPER_LIKES)) assert.equal((await like(a, o, { super: true })).status, 200);
    const sixth = await like(a, others[5], { super: true });
    assert.equal(sixth.status, 402);

    const boost = await t.call('POST', '/api/billing/boost', { token: a.token });
    assert.equal(boost.status, 200);
    assert.ok(boost.body.boost.activeUntil);
    assert.equal(boost.body.boost.monthlyLeft, 0);
    assert.equal((await t.call('POST', '/api/billing/boost', { token: a.token })).status, 409);
  });

  test('kdo tě lajkl: počet vidí každý, profily jen Gold', async () => {
    paid();
    const [a, b] = await people(2, place());
    await like(b, a);
    const free = await t.call('GET', '/api/likes', { token: a.token });
    assert.deepEqual(free.body, { count: 1, profiles: [] });
    await buy(a, 'gold_1m');
    const gold = await t.call('GET', '/api/likes', { token: a.token });
    assert.equal(gold.body.profiles[0].id, b.id);
  });

  test('Platinum: prioritní lajk jde v balíčku dopředu, odeslané lajky za 7 dní', async () => {
    paid();
    const at = place();
    const [target, plain, vip] = await people(3, at);
    await like(plain, target);
    await like(vip, target);
    assert.equal((await t.call('GET', '/api/likes/sent', { token: vip.token })).status, 402);
    await buy(vip, 'platinum_1m');
    assert.equal((await deck(target))[0].id, vip.id);
    const sent = await t.call('GET', '/api/likes/sent', { token: vip.token });
    assert.deepEqual(
      sent.body.map((p) => p.id),
      [target.id],
    );
  });

  test('inkognito: vidí tě jen ti, koho lajkneš', async () => {
    paid();
    const at = place();
    const [shy, x, y] = await people(3, at);
    assert.equal((await t.call('PUT', '/api/billing/settings', { token: shy.token, body: { incognito: true } })).status, 402);
    await buy(shy, 'plus_1m');
    const set = await t.call('PUT', '/api/billing/settings', { token: shy.token, body: { incognito: true } });
    assert.equal(set.body.incognito, true);
    await like(shy, x);
    assert.ok((await deck(x)).some((p) => p.id === shy.id));
    assert.ok(!(await deck(y)).some((p) => p.id === shy.id));
  });

  test('na cestách: swipuješ v jiném městě a tam tě i vidí', async () => {
    paid();
    const home = place();
    const [traveler] = await people(1, home);
    const [local] = await people(1, { lat: 49.19, lng: 16.61 });
    assert.ok(!(await deck(traveler)).some((p) => p.id === local.id));
    await buy(traveler, 'plus_1m');
    const set = await t.call('PUT', '/api/billing/settings', { token: traveler.token, body: { travelCity: 'brno' } });
    assert.equal(set.body.travelCity, 'brno');
    const seen = (await deck(traveler)).find((p) => p.id === local.id);
    assert.ok(seen);
    assert.ok(seen.distanceKm <= 2);
    const back = (await deck(local)).find((p) => p.id === traveler.id);
    assert.equal(back.traveling, true);
    assert.equal((await t.call('PUT', '/api/billing/settings', { token: traveler.token, body: { travelCity: 'atlantis' } })).status, 400);
  });

  test('Dnes večer: jednorázově nebo v Platinum, štítek na kartě do 6:00', async () => {
    paid();
    const at = place();
    const [a, b] = await people(2, at);
    assert.equal((await t.call('POST', '/api/billing/tonight', { token: a.token })).status, 402);
    await buy(a, 'tonight_1');
    const on = await t.call('POST', '/api/billing/tonight', { token: a.token });
    assert.equal(on.status, 200);
    assert.equal(on.body.tonight.credits, 0);
    assert.equal((await deck(b)).find((p) => p.id === a.id).tonight, true);
    await t.call('DELETE', '/api/billing/tonight', { token: a.token });
    assert.equal((await deck(b)).find((p) => p.id === a.id).tonight, false);

    // 6:00 pražského času = 4:00 UTC v létě
    assert.equal(tonightEnd(Date.parse('2026-07-01T20:00:00Z')), '2026-07-02T04:00:00.000Z');
    assert.equal(tonightEnd(Date.parse('2026-07-02T02:30:00Z')), '2026-07-02T04:00:00.000Z');
  });

  test('účet s vážným příznakem si viditelnost nekoupí a jeho super lajk se neprojeví', async () => {
    paid();
    const at = place();
    const [bad, victim] = await people(2, at);
    await buy(bad, 'gold_1m');
    addFlag(t.db, { userId: bad.id, source: 'safety', reason: 'sos', priority: 'high' });
    assert.equal((await buy(bad, 'boost_1')).status, 403);
    assert.equal((await t.call('POST', '/api/billing/boost', { token: bad.token })).status, 403);
    assert.equal((await like(bad, victim, { super: true })).status, 200);
    const card = (await deck(victim)).find((p) => p.id === bad.id);
    assert.equal(card.superLike, false);
  });
});

describe('platby přes obchody (RevenueCat webhook)', () => {
  const hook = (event, auth = 'Bearer rc-secret') =>
    t.call('POST', '/api/billing/webhook/revenuecat', { headers: { authorization: auth }, body: { event } });

  test('bez správného klíče nic', async () => {
    t.ctx.config.revenuecat.webhookAuth = 'Bearer rc-secret';
    assert.equal((await hook({ type: 'TEST' }, 'Bearer jiny')).status, 401);
  });

  test('nákup, obnova a vypršení předplatného; jednorázový nákup se nepřipíše dvakrát', async () => {
    t.ctx.config.revenuecat.webhookAuth = 'Bearer rc-secret';
    const [a] = await people(1, place());
    const inMonth = Date.now() + 30 * 86400_000;
    await hook({ type: 'INITIAL_PURCHASE', app_user_id: String(a.id), product_id: 'yesyes_gold_1m', original_transaction_id: 'tx-1', expiration_at_ms: inMonth });
    assert.equal((await billing(a)).plan, 'gold');

    await hook({ type: 'RENEWAL', app_user_id: String(a.id), product_id: 'yesyes_gold_1m', original_transaction_id: 'tx-1', expiration_at_ms: inMonth + 30 * 86400_000 });
    assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM subscriptions WHERE user_id = ?').get(a.id).n, 1);
    assert.equal(Date.parse((await billing(a)).planExpiresAt), inMonth + 30 * 86400_000);

    await hook({ type: 'EXPIRATION', app_user_id: String(a.id), product_id: 'yesyes_gold_1m', original_transaction_id: 'tx-1' });
    assert.equal((await billing(a)).plan, 'free');

    const credit = { type: 'NON_RENEWING_PURCHASE', app_user_id: String(a.id), product_id: 'boost_5:jednorazove', transaction_id: 'tx-2' };
    await hook(credit);
    await hook(credit);
    assert.equal((await billing(a)).boost.credits, 5);

    const unknown = await hook({ type: 'INITIAL_PURCHASE', app_user_id: '999999', product_id: 'gold_1m' });
    assert.equal(unknown.body.ignored, true);
  });

  test('po vypršení vyšší úrovně dál platí nižší', async () => {
    const [a] = await people(1, place());
    const soon = new Date(Date.now() + 1000).toISOString();
    const later = new Date(Date.now() + 60 * 86400_000).toISOString();
    const insert = t.db.prepare(
      "INSERT INTO subscriptions (user_id, plan, product_id, source, expires_at, created_at, updated_at) VALUES (?, ?, ?, 'dev', ?, ?, ?)",
    );
    insert.run(a.id, 'platinum', 'platinum_1m', soon, soon, soon);
    insert.run(a.id, 'plus', 'plus_12m', later, soon, soon);
    t.db.prepare("UPDATE users SET plan = 'platinum', plan_expires_at = ? WHERE id = ?").run(soon, a.id);
    refreshExpiredPlans(t.db, Date.now() + 5000);
    assert.equal(t.db.prepare('SELECT plan FROM users WHERE id = ?').get(a.id).plan, 'plus');
  });
});
