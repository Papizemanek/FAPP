import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { localeFromRequest, tr } from '../src/i18n.js';
import { runWatchdog } from '../src/services/watchdog.js';
import { startTestServer } from './helpers.js';

let t;
before(async () => {
  t = await startTestServer();
});
after(() => t.close());

const EN = { 'Accept-Language': 'en-US,en;q=0.9' };
const lastSms = () => t.services.sms.sent.at(-1);
const register = (headers, body = {}) =>
  t.call('POST', '/api/auth/register', {
    headers,
    body: { email: `x${Math.random()}@test.cz`, password: 'tajne-heslo-123', name: 'Xaver', birthdate: '1990-01-01', gender: 'man', interestedIn: ['woman'], ...body },
  });

describe('jazyk chyb', () => {
  test('Accept-Language: en → chyba anglicky, názvy polí taky', async () => {
    const res = await register(EN);
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "You must confirm you're 18 or older.");
    const short = await register(EN, { password: 'kratke', confirmAdult: true, acceptRules: true });
    assert.equal(short.body.error, '“password” is too short.');
  });

  test('neznámý jazyk → angličtina, bez hlavičky (nebo jen „*“) → čeština', async () => {
    assert.equal((await register({ 'Accept-Language': 'xx-YY' })).body.error, "You must confirm you're 18 or older.");
    assert.notEqual((await register({ 'Accept-Language': 'de-AT' })).body.error, "You must confirm you're 18 or older.", 'regionální varianta → přeložená němčina');
    assert.equal((await register({})).body.error, 'Musíš potvrdit, že je ti 18 let nebo víc.');
    assert.equal((await register({ 'Accept-Language': '*' })).body.error, 'Musíš potvrdit, že je ti 18 let nebo víc.');
    assert.equal((await register({ 'Accept-Language': 'cs-CZ' })).body.error, 'Musíš potvrdit, že je ti 18 let nebo víc.');
    assert.equal((await register({ 'X-App-Locale': 'en', 'Accept-Language': 'cs' })).body.error, "You must confirm you're 18 or older.");
    assert.equal((await t.call('GET', '/api/neexistuje', { headers: EN })).body.error, 'Not found.');
  });

  test('402 nabídka předplatného: přeložený text, strojové údaje zůstanou, params neprosáknou', async () => {
    const u = await t.makeUser();
    const res = await t.call('POST', '/api/swipes/rewind', { token: u.token, headers: EN });
    assert.equal(res.status, 402);
    assert.equal(res.body.error, 'Rewind is part of F*app Plus.');
    assert.equal(res.body.code, 'upgrade');
    assert.equal(res.body.plan, 'plus');
    assert.equal('params' in res.body, false);
    const cs = await t.call('POST', '/api/swipes/rewind', { token: u.token });
    assert.equal(cs.body.error, 'Vrácení swipu je součástí F*app Plus.');
  });

  test('discover: chybějící poloha a fotka mají strojový kód', async () => {
    const u = await t.makeUser();
    t.db.prepare('UPDATE users SET lat = NULL, lng = NULL WHERE id = ?').run(u.id);
    const noLocation = await t.call('GET', '/api/discover', { token: u.token });
    assert.equal(noLocation.status, 409);
    assert.equal(noLocation.body.code, 'no_location');
    t.db.prepare("UPDATE users SET lat = 50.08, lng = 14.42, photos = '[]' WHERE id = ?").run(u.id);
    const noPhoto = await t.call('GET', '/api/discover', { token: u.token, headers: EN });
    assert.equal(noPhoto.body.code, 'no_photo');
    assert.equal(noPhoto.body.error, 'Add at least one photo.');
  });

  test('přihlášený bez hlavičky dostane chyby ve svém jazyce; X-App-Locale jazyk uloží', async () => {
    const u = await t.makeUser({ verify: false, headers: EN });
    assert.equal(t.db.prepare('SELECT locale FROM users WHERE id = ?').get(u.id).locale, 'en');
    assert.equal((await t.call('GET', '/api/discover', { token: u.token })).body.error, 'Verify your identity first.');
    await t.call('GET', '/api/me', { token: u.token, headers: { 'X-App-Locale': 'cs' } });
    assert.equal(t.db.prepare('SELECT locale FROM users WHERE id = ?').get(u.id).locale, 'cs');
    // Accept-Language samo uložený jazyk nemění (mohl ho poslat prohlížeč nebo systém).
    await t.call('GET', '/api/me', { token: u.token, headers: EN });
    assert.equal(t.db.prepare('SELECT locale FROM users WHERE id = ?').get(u.id).locale, 'cs');
  });

  test('ověření: důvod zamítnutí v jazyce požadavku', async () => {
    const u = await t.makeUser({ verify: false });
    await t.call('POST', '/api/verification/start', { token: u.token });
    const res = await t.call('POST', '/api/verification/dev-decide', {
      token: u.token,
      headers: EN,
      body: { firstName: 'A', lastName: 'B', dateOfBirth: new Date(Date.now() - 16 * 365.25 * 86400_000).toISOString().slice(0, 10) },
    });
    assert.equal(res.body.message, "Verification showed you're not 18 yet. F*app is for adults only.");
  });
});

describe('upozornění moderace u zprávy', () => {
  test('ukládá se klíč, příjemce ho vidí ve svém jazyce; starší český text projde', async () => {
    const m = await t.makeMatch();
    await t.call('POST', `/api/matches/${m.matchId}/messages`, { token: m.a.token, body: { text: 'napiš mi na 777 123 456' } });
    assert.equal(t.db.prepare('SELECT warning FROM messages WHERE match_id = ?').get(m.matchId).warning, 'moderation.contact');
    const en = await t.call('GET', `/api/matches/${m.matchId}/messages`, { token: m.b.token, headers: EN });
    assert.match(en.body[0].warning, /outside the app/);
    const cs = await t.call('GET', `/api/matches/${m.matchId}/messages`, { token: m.b.token });
    assert.match(cs.body[0].warning, /mimo aplikaci/);

    const insert = t.db.prepare("INSERT INTO messages (match_id, sender_id, body, warning, created_at) VALUES (?, ?, '', ?, ?)");
    insert.run(m.matchId, m.a.id, tr('cs', 'moderation.consentPressure'), new Date().toISOString());
    insert.run(m.matchId, m.a.id, 'Starší upozornění, které už ve slovníku není.', new Date().toISOString());
    const old = await t.call('GET', `/api/matches/${m.matchId}/messages`, { token: m.b.token, headers: EN });
    assert.match(old.body[1].warning, /isn't consent/);
    assert.equal(old.body[2].warning, 'Starší upozornění, které už ve slovníku není.');
  });

  test('zablokovaná zpráva: důvod přeložený do jazyka odesílatele', async () => {
    const m = await t.makeMatch();
    const res = await t.call('POST', `/api/matches/${m.matchId}/messages`, { token: m.a.token, headers: EN, body: { text: 'je mi 16' } });
    assert.equal(res.status, 422);
    assert.equal(res.body.error, 'Message not sent. This message suggests one of you may be under 18. F*app is 18+ only.');
  });
});

describe('SMS a push v jazyce uživatele', () => {
  async function meetup(aOpts = {}) {
    const a = await t.makeUser({ gender: 'woman', interestedIn: ['man'], ...aOpts });
    const b = await t.makeUser({ gender: 'man', interestedIn: ['woman'] });
    const matchId = await t.matchUsers(a, b);
    await t.setSafety(a);
    await t.confirmedAgreement({ a, b, matchId });
    await t.call('PUT', '/api/auth/push-token', { token: a.token, body: { pushToken: `ExponentPushToken[${a.id}]` } });
    const start = await t.call('POST', `/api/matches/${matchId}/safety`, { token: a.token, body: { checkInMinutes: 30 } });
    assert.equal(start.status, 201, JSON.stringify(start.body));
    return { a, b, matchId, session: start.body };
  }

  test('uživatel registrovaný anglicky: SMS důvěryhodné osobě i push anglicky', async () => {
    const m = await meetup({ headers: EN });
    assert.equal(lastSms().body, `${m.a.name} is meeting someone and chose you as their trusted contact. See where they are and if they're OK: ${m.session.shareUrl}`);

    t.db.prepare('UPDATE safety_sessions SET last_check_in_at = ? WHERE id = ?').run(new Date(Date.now() - 40 * 60_000).toISOString(), m.session.id);
    await runWatchdog(t.ctx);
    assert.match(lastSms().body, /hasn't checked in - they were due to confirm they're OK by \d{2}:\d{2}\s?[AP]M\. Try calling\./);
    const push = t.services.push.sent.at(-1);
    assert.equal(push.to, `ExponentPushToken[${m.a.id}]`);
    assert.equal(push.title, 'You missed your check-in');
    assert.equal(push.body, 'Petra has been alerted. Confirm you\'re OK.');

    await t.call('POST', `/api/safety/${m.session.id}/sos`, { token: m.a.token });
    assert.equal(lastSms().body, `ALERT: ${m.a.name} needs help. Location and details: ${m.session.shareUrl}`);
  });

  test('jazyk SMS se zafixuje při startu schůzky; starší schůzka bez jazyka použije jazyk uživatele', async () => {
    const m = await meetup({ headers: EN });
    // Změna jazyka v aplikaci během schůzky nepřepne jazyk SMS k téhle schůzce.
    await t.call('GET', '/api/me', { token: m.a.token, headers: { 'X-App-Locale': 'cs' } });
    await t.call('POST', `/api/safety/${m.session.id}/sos`, { token: m.a.token });
    assert.match(lastSms().body, /^ALERT: /);
    // Schůzka z doby před překlady (locale NULL) → aktuální jazyk uživatele.
    t.db.prepare('UPDATE safety_sessions SET locale = NULL WHERE id = ?').run(m.session.id);
    await t.call('POST', `/api/safety/${m.session.id}/sos/cancel`, { token: m.a.token, body: { pin: '1234' } });
    assert.match(lastSms().body, /zrušil\/a poplach – byl to omyl/);
  });

  test('česky registrovaný uživatel má SMS i push dál česky', async () => {
    const m = await meetup();
    assert.match(lastSms().body, /vybral\/a si tě jako důvěryhodnou osobu/);
    const agreement = (await t.call('GET', `/api/matches/${m.matchId}`, { token: m.b.token })).body.agreement;
    await t.call('POST', `/api/agreements/${agreement.id}/revoke`, { token: m.b.token, headers: EN });
    const push = t.services.push.sent.at(-1);
    assert.equal(push.title, 'Domluva zrušena', 'jazyk příjemce, ne odesílatele');
    assert.equal(push.body, `${m.b.name} domluvu zrušil/a. Schůzka se nekoná – a to je potřeba respektovat.`);
  });
});

describe('stránka pro důvěryhodnou osobu', () => {
  test('slovník „share“ pro angličtinu', async () => {
    const res = await t.call('GET', '/api/share/i18n/en');
    assert.equal(res.status, 200);
    assert.equal(res.body.locale, 'en');
    assert.equal(res.body.dir, 'ltr');
    assert.equal(res.body.emergency, '112');
    assert.equal(res.body.messages.okTitle, '{name} is OK');
    assert.deepEqual(res.body.messages.locationAgo, { one: 'Location {count} min ago', other: 'Location {count} min ago' });
    // Seznam jazyků prohlížeče; neznámý jazyk dostane anglické texty.
    const de = await t.call('GET', `/api/share/i18n/${encodeURIComponent('de-AT,en')}`);
    assert.equal(de.body.locale, 'de');
    assert.notEqual(de.body.messages.okTitle, '{name} is OK');
    const xx = await t.call('GET', `/api/share/i18n/${encodeURIComponent('xx-YY')}`);
    assert.equal(xx.body.messages.okTitle, '{name} is OK');
    assert.equal((await t.call('GET', '/api/share/i18n/ar')).body.dir, 'rtl');
    assert.equal((await t.call('GET', '/api/share/i18n/cs')).body.messages.header, 'Bezpečnostní odkaz');
  });

  test('stránka se vykreslí v jazyce ?lang=, prohlížeče, jinak v jazyce SMS', async () => {
    const m = await t.makeMatch({ a: { headers: EN } });
    await t.setSafety(m.a);
    await t.confirmedAgreement(m);
    const start = await t.call('POST', `/api/matches/${m.matchId}/safety`, { token: m.a.token, body: { checkInMinutes: 30 } });
    const page = async (query, headers) => (await fetch(`${start.body.shareUrl}${query}`, { headers })).text();

    const en = await page('?lang=en', { 'Accept-Language': 'cs' });
    assert.match(en, /<html lang="en" dir="ltr">/);
    assert.match(en, /<title>F\*app – safety link<\/title>/);
    const embedded = JSON.parse(en.match(/<script id="i18n" type="application\/json">(.*?)<\/script>/s)[1]);
    assert.equal(embedded.locale, 'en');
    assert.equal(embedded.explicit, true);
    assert.equal(embedded.messages.alarmTitle, '{name} needs help');
    assert.equal(en.includes('{{'), false, 'žádný nenahrazený zástupný text');

    assert.match(await page('', { 'Accept-Language': 'cs-CZ,cs;q=0.9' }), /Bezpečnostní odkaz/);
    // Bez použitelné hlavičky: jazyk uživatele (SMS) a stránka ho ještě upřesní podle navigator.languages.
    const fallback = await page('', { 'Accept-Language': '*' });
    assert.match(fallback, /<html lang="en"/);
    assert.equal(JSON.parse(fallback.match(/<script id="i18n" type="application\/json">(.*?)<\/script>/s)[1]).explicit, false);
  });
});

test('tr: záloha en → cs, množné číslo podle jazyka', () => {
  assert.equal(tr('xx', 'sms.alarm', { name: 'Eva', url: 'u' }), 'ALERT: Eva needs help. Location and details: u');
  assert.equal(tr(undefined, 'chat.photo'), 'Fotka');
  assert.equal(tr('pt-PT', 'chat.photo'), 'Foto');
  assert.equal(tr('cs', 'profile.maxPhotos', { count: 3 }), 'Maximálně 3 fotky.');
  assert.equal(tr('cs', 'profile.maxPhotos', { count: 5 }), 'Maximálně 5 fotek.');
  assert.equal(tr('en', 'profile.maxPhotos', { count: 1 }), 'You can have up to 1 photo.');
  assert.equal(tr('en', 'neexistujici.klic'), 'neexistujici.klic');
  const req = (h) => ({ headers: Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v])) });
  assert.equal(localeFromRequest(req({})), 'cs');
  assert.equal(localeFromRequest(req({ 'Accept-Language': '*' })), 'cs');
  assert.equal(localeFromRequest(req({ 'Accept-Language': 'fr-CA,fr;q=0.8' })), 'fr');
  assert.equal(localeFromRequest(req({ 'Accept-Language': 'xx' })), 'en');
  assert.equal(localeFromRequest(req({ 'Accept-Language': 'zh-TW' })), 'zh-Hant');
  assert.equal(localeFromRequest(req({ 'X-App-Locale': 'sk', 'Accept-Language': 'en' })), 'sk');
});
