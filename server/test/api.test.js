import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { purgeOldData, runWatchdog } from '../src/services/watchdog.js';
import { PHOTO, jpegWithExif, startTestServer } from './helpers.js';

let t;
before(async () => {
  t = await startTestServer();
});
after(() => t.close());

const sms = () => t.services.sms.sent;
const lastSms = () => sms()[sms().length - 1];

describe('registrace a ověření', () => {
  test('nezletilý se nezaregistruje', async () => {
    const res = await t.call('POST', '/api/auth/register', {
      body: {
        email: 'mlady@test.cz',
        password: 'tajne-heslo-123',
        name: 'Mladý',
        birthdate: new Date(Date.now() - 17 * 365.25 * 86400_000).toISOString().slice(0, 10),
        gender: 'man',
        interestedIn: ['woman'],
        confirmAdult: true,
        acceptRules: true,
      },
    });
    assert.equal(res.status, 403);
  });

  test('bez výslovného potvrzení 18+ a pravidel to nejde', async () => {
    const res = await t.call('POST', '/api/auth/register', {
      body: { email: 'x@test.cz', password: 'tajne-heslo-123', name: 'Xaver', birthdate: '1990-01-01', gender: 'man', interestedIn: ['woman'] },
    });
    assert.equal(res.status, 400);
  });

  test('bez ověřené totožnosti není seznamování', async () => {
    const u = await t.makeUser({ verify: false });
    assert.equal((await t.call('GET', '/api/discover', { token: u.token })).status, 403);
    assert.equal((await t.call('POST', '/api/swipes', { token: u.token, body: { targetId: 1, like: true } })).status, 403);
  });

  test('ověření, které ukáže věk pod 18, účet pozastaví', async () => {
    const u = await t.makeUser({ verify: false });
    await t.call('POST', '/api/verification/start', { token: u.token });
    const res = await t.call('POST', '/api/verification/dev-decide', {
      token: u.token,
      body: { firstName: 'A', lastName: 'B', dateOfBirth: new Date(Date.now() - 16 * 365.25 * 86400_000).toISOString().slice(0, 10) },
    });
    assert.equal(res.body.status, 'declined');
    assert.match(res.body.message, /18/);
    assert.equal(t.db.prepare('SELECT status FROM users WHERE id = ?').get(u.id).status, 'suspended');
  });

  test('jeden člověk = jeden účet', async () => {
    await t.makeUser({ name: 'Dvojnik', lastName: 'Stejny', birthdate: '1991-02-03' });
    const second = await t.makeUser({ verify: false });
    await t.call('POST', '/api/verification/start', { token: second.token });
    const res = await t.call('POST', '/api/verification/dev-decide', {
      token: second.token,
      body: { firstName: 'Dvojník', lastName: 'STEJNÝ', dateOfBirth: '1991-02-03' },
    });
    assert.equal(res.body.status, 'declined');
    assert.match(res.body.message, /jen jeden/);
  });
});

describe('fotky', () => {
  test('server z fotky odstraní EXIF i s GPS polohou', async () => {
    const u = await t.makeUser({ verify: false });
    const res = await t.call('POST', '/api/me/photos', { token: u.token, body: { jpegBase64: jpegWithExif().toString('base64') } });
    assert.equal(res.status, 201);
    const img = await fetch(t.base + res.body.photos[0], { headers: { Authorization: `Bearer ${u.token}` } });
    const bytes = Buffer.from(await img.arrayBuffer());
    assert.equal(bytes.includes(Buffer.from('GPSLatitude')), false);
    assert.equal(bytes.includes(Buffer.from('Exif')), false);
    assert.equal(bytes[0], 0xff);
    assert.equal(bytes[1], 0xd8);
  });

  test('fotky vidí jen přihlášení', async () => {
    const u = await t.makeUser();
    const me = await t.call('GET', '/api/me', { token: u.token });
    assert.equal((await fetch(t.base + me.body.photos[0])).status, 401);
  });
});

describe('objevování a match', () => {
  test('vzájemný like vytvoří match a profily z balíčku zmizí', async () => {
    const a = await t.makeUser({ gender: 'woman', interestedIn: ['man'], lat: 49.19, lng: 16.6 });
    const b = await t.makeUser({ gender: 'man', interestedIn: ['woman'], lat: 49.2, lng: 16.61 });
    const deck = await t.call('GET', '/api/discover', { token: a.token });
    const card = deck.body.find((p) => p.id === b.id);
    assert.ok(card, 'b je v balíčku');
    assert.equal(Number.isInteger(card.distanceKm), true, 'vzdálenost jen v celých km');
    assert.equal(card.verified, true);

    assert.equal((await t.call('POST', '/api/swipes', { token: a.token, body: { targetId: b.id, like: true } })).body.match, null);
    const res = await t.call('POST', '/api/swipes', { token: b.token, body: { targetId: a.id, like: true } });
    assert.ok(res.body.match.id);
    const deckAfter = await t.call('GET', '/api/discover', { token: a.token });
    assert.equal(deckAfter.body.some((p) => p.id === b.id), false);
  });

  test('poloha domova se ukládá jen zaokrouhlená', async () => {
    const u = await t.makeUser({ verify: false });
    await t.call('PUT', '/api/me/location', { token: u.token, body: { lat: 50.087654, lng: 14.421234 } });
    const row = t.db.prepare('SELECT lat, lng FROM users WHERE id = ?').get(u.id);
    assert.deepEqual({ ...row }, { lat: 50.09, lng: 14.42 });
  });
});

describe('chat a moderace', () => {
  test('zmínka o nezletilosti se nedoručí a jde moderátorům', async () => {
    const { a, matchId } = await t.makeMatch();
    const res = await t.call('POST', `/api/matches/${matchId}/messages`, { token: a.token, body: { text: 'jen abys věděl, je mi 16' } });
    assert.equal(res.status, 422);
    const flag = t.db.prepare("SELECT * FROM flags WHERE source = 'chat' AND user_id = ?").get(a.id);
    assert.equal(flag.priority, 'high');
    const msgs = await t.call('GET', `/api/matches/${matchId}/messages`, { token: a.token });
    assert.equal(msgs.body.length, 0);
  });

  test('sdílení telefonu se doručí s upozorněním jen pro příjemce; text je v DB šifrovaný', async () => {
    const { a, b, matchId } = await t.makeMatch();
    await t.call('POST', `/api/matches/${matchId}/messages`, { token: a.token, body: { text: 'napiš mi na 777 123 456' } });
    const mine = await t.call('GET', `/api/matches/${matchId}/messages`, { token: a.token });
    const theirs = await t.call('GET', `/api/matches/${matchId}/messages`, { token: b.token });
    assert.equal(mine.body[0].warning, '');
    assert.match(theirs.body[0].warning, /mimo aplikaci/);
    const stored = t.db.prepare('SELECT body FROM messages WHERE match_id = ?').get(matchId).body;
    assert.ok(stored.startsWith('v1:'));
    assert.equal(stored.includes('777'), false);
  });

  test('fotka v chatu je jen pro dvojici', async () => {
    const { a, b, matchId } = await t.makeMatch();
    const stranger = await t.makeUser();
    const msg = await t.call('POST', `/api/matches/${matchId}/messages`, { token: a.token, body: { jpegBase64: PHOTO.toString('base64') } });
    const get = (u) => fetch(t.base + msg.body.imageUrl, { headers: { Authorization: `Bearer ${u.token}` } });
    assert.equal((await get(b)).status, 200);
    assert.equal((await get(stranger)).status, 404);
  });
});

describe('dohoda (souhlas)', () => {
  test('platí, až když ji potvrdí oba; změna vyžaduje nové potvrzení obou', async () => {
    const m = await t.makeMatch();
    const base = { meetAt: t.inHours(3), place: 'U mě', activities: ['kissing'], condom: true, sober: true, safeword: 'Ananas' };

    assert.equal((await t.call('POST', `/api/matches/${m.matchId}/agreement`, { token: m.a.token, body: base })).status, 400, 'bez souhlasu nejde');
    const v1 = await t.call('POST', `/api/matches/${m.matchId}/agreement`, { token: m.a.token, body: { ...base, consent: true } });
    assert.equal(v1.status, 201);
    assert.equal(v1.body.status, 'pending');
    assert.ok(v1.body.confirmedByMe);

    const stale = await t.call('POST', `/api/agreements/${v1.body.id}/confirm`, { token: m.b.token, body: { version: 99, consent: true } });
    assert.equal(stale.status, 409);

    const ok = await t.call('POST', `/api/agreements/${v1.body.id}/confirm`, { token: m.b.token, body: { version: 1, consent: true } });
    assert.equal(ok.body.status, 'confirmed');

    const v2 = await t.call('POST', `/api/matches/${m.matchId}/agreement`, {
      token: m.b.token,
      body: { ...base, activities: ['kissing', 'oral'], consent: true },
    });
    assert.equal(v2.body.version, 2);
    assert.equal(v2.body.status, 'pending');
    assert.equal(v2.body.confirmedByPartner, null);
  });

  test('odvolat jde kdykoli; schůzku pak nejde zahájit', async () => {
    const m = await t.makeMatch();
    await t.setSafety(m.a);
    const agreement = await t.confirmedAgreement(m);
    const revoked = await t.call('POST', `/api/agreements/${agreement.id}/revoke`, { token: m.b.token });
    assert.equal(revoked.body.status, 'revoked');
    const start = await t.call('POST', `/api/matches/${m.matchId}/safety`, { token: m.a.token, body: { checkInMinutes: 30 } });
    assert.equal(start.status, 409);
  });

  test('stopslovo je v DB šifrované', async () => {
    const m = await t.makeMatch();
    const agreement = await t.confirmedAgreement(m, { safeword: 'Brokolice' });
    assert.equal(agreement.safeword, 'Brokolice');
    const row = t.db.prepare('SELECT safeword FROM agreements WHERE id = ?').get(agreement.id);
    assert.equal(row.safeword.includes('Brokolice'), false);
  });
});

describe('bezpečnostní režim', () => {
  async function startMeetup() {
    const m = await t.makeMatch();
    await t.setSafety(m.a);
    await t.confirmedAgreement(m);
    const start = await t.call('POST', `/api/matches/${m.matchId}/safety`, { token: m.a.token, body: { checkInMinutes: 30 } });
    assert.equal(start.status, 201, JSON.stringify(start.body));
    const token = start.body.shareUrl.split('/s/')[1];
    await t.call('POST', `/api/safety/${start.body.id}/location`, { token: m.a.token, body: { lat: 50.1, lng: 14.4, accuracy: 15, battery: 0.6 } });
    const share = async () => (await t.call('GET', `/api/share/${token}`)).body;
    return { ...m, session: start.body, share };
  }

  test('bez PINu a důvěryhodné osoby schůzku nejde zahájit', async () => {
    const m = await t.makeMatch();
    await t.confirmedAgreement(m);
    const res = await t.call('POST', `/api/matches/${m.matchId}/safety`, { token: m.a.token, body: { checkInMinutes: 30 } });
    assert.equal(res.status, 409);
  });

  test('start pošle důvěryhodné osobě SMS s odkazem; protějšek vidí jen „aktivní“', async () => {
    const m = await startMeetup();
    assert.equal(lastSms().to, '+420777123456');
    assert.match(lastSms().body, /\/s\//);
    const partnerView = await t.call('GET', `/api/matches/${m.matchId}`, { token: m.b.token });
    assert.deepEqual(partnerView.body.safety.partner, { active: true });
    const share = await m.share();
    assert.equal(share.status, 'ok');
    assert.equal(share.location.lat, 50.1);
    assert.equal(share.partner.name, m.b.name);
  });

  test('nouzový PIN vypadá jako běžný check-in, ale spustí poplach', async () => {
    const m = await startMeetup();
    const normal = await t.call('POST', `/api/safety/${m.session.id}/checkin`, { token: m.a.token, body: { pin: '1234' } });
    const duress = await t.call('POST', `/api/safety/${m.session.id}/checkin`, { token: m.a.token, body: { pin: '9999' } });
    assert.equal(duress.status, normal.status);
    assert.deepEqual(Object.keys(duress.body).sort(), Object.keys(normal.body).sort());
    assert.equal(duress.body.status, 'ok', 'telefon nic neprozradí');
    assert.equal(duress.body.sosAt, null);
    assert.match(lastSms().body, /POPLACH/);
    assert.equal((await m.share()).status, 'alarm');
    const partnerView = await t.call('GET', `/api/matches/${m.matchId}`, { token: m.b.token });
    assert.deepEqual(partnerView.body.safety.partner, { active: true }, 'protějšek nic nepozná');
  });

  test('třikrát špatný PIN spustí tichý poplach', async () => {
    const m = await startMeetup();
    for (let i = 0; i < 3; i++) {
      const res = await t.call('POST', `/api/safety/${m.session.id}/checkin`, { token: m.a.token, body: { pin: '0000' } });
      assert.equal(res.status, 403);
    }
    assert.match(lastSms().body, /POPLACH/);
    assert.equal((await m.share()).status, 'alarm');
    const own = await t.call('GET', `/api/safety/${m.session.id}`, { token: m.a.token });
    assert.equal(own.body.status, 'ok');
  });

  test('zmeškaný check-in pohlídá server a pošle SMS; po check-inu přijde „je v pořádku“', async () => {
    const m = await startMeetup();
    t.db.prepare('UPDATE safety_sessions SET last_check_in_at = ? WHERE id = ?').run(new Date(Date.now() - 40 * 60_000).toISOString(), m.session.id);
    await runWatchdog(t.ctx);
    assert.match(lastSms().body, /neozval/);
    assert.equal((await m.share()).status, 'overdue');
    const count = sms().length;
    await runWatchdog(t.ctx);
    assert.equal(sms().length, count, 'upozornění jen jednou');
    await t.call('POST', `/api/safety/${m.session.id}/checkin`, { token: m.a.token, body: { pin: '1234' } });
    assert.match(lastSms().body, /je v pořádku/);
    assert.equal((await m.share()).status, 'ok');
  });

  test('SOS a jeho zrušení běžným PINem', async () => {
    const m = await startMeetup();
    const sos = await t.call('POST', `/api/safety/${m.session.id}/sos`, { token: m.a.token });
    assert.equal(sos.body.status, 'sos');
    assert.match(lastSms().body, /POPLACH/);
    assert.equal((await m.share()).status, 'alarm');
    await t.call('POST', `/api/safety/${m.session.id}/sos/cancel`, { token: m.a.token, body: { pin: '1234' } });
    assert.match(lastSms().body, /omyl/);
    assert.equal((await m.share()).status, 'ok');
  });

  test('zrušení SOS nouzovým PINem poplach na telefonu schová, ale nezruší', async () => {
    const m = await startMeetup();
    await t.call('POST', `/api/safety/${m.session.id}/sos`, { token: m.a.token });
    const count = sms().length;
    const res = await t.call('POST', `/api/safety/${m.session.id}/sos/cancel`, { token: m.a.token, body: { pin: '9999' } });
    assert.equal(res.body.status, 'ok');
    assert.equal(sms().length, count, 'žádná SMS „byl to omyl“');
    assert.equal((await m.share()).status, 'alarm');
  });

  test('ukončení běžným PINem smaže polohu; nouzovým ji nechá a spustí poplach', async () => {
    const ok = await startMeetup();
    await t.call('POST', `/api/safety/${ok.session.id}/end`, { token: ok.a.token, body: { pin: '1234' } });
    const okShare = await ok.share();
    assert.equal(okShare.status, 'ended');
    assert.equal(okShare.location, undefined);
    assert.match(lastSms().body, /ukončil/);

    const duress = await startMeetup();
    const res = await t.call('POST', `/api/safety/${duress.session.id}/end`, { token: duress.a.token, body: { pin: '9999' } });
    assert.equal(res.body.status, 'ended');
    const share = await duress.share();
    assert.equal(share.status, 'alarm');
    assert.equal(share.location.lat, 50.1);
  });

  test('protějšek nesmí smazat účet během schůzky; odvolání souhlasu režim nevypne', async () => {
    const m = await startMeetup();
    const del = await t.call('DELETE', '/api/me', { token: m.b.token, body: { password: 'tajne-heslo-123' } });
    assert.equal(del.status, 409);
    const agreement = (await t.call('GET', `/api/matches/${m.matchId}`, { token: m.b.token })).body.agreement;
    await t.call('POST', `/api/agreements/${agreement.id}/revoke`, { token: m.b.token });
    const own = await t.call('GET', `/api/safety/${m.session.id}`, { token: m.a.token });
    assert.equal(own.body.endedAt, null);
  });

  test('pozastavený účet může dál používat svůj bezpečnostní režim', async () => {
    const m = await startMeetup();
    t.db.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").run(m.a.id);
    assert.equal((await t.call('GET', '/api/discover', { token: m.a.token })).status, 403);
    const res = await t.call('POST', `/api/safety/${m.session.id}/checkin`, { token: m.a.token, body: { pin: '1234' } });
    assert.equal(res.status, 200);
  });
});

describe('nahlášení, hodnocení, moderátoři', () => {
  test('nahlášení porušení souhlasu účet hned pozastaví a zablokuje', async () => {
    const m = await t.makeMatch();
    const res = await t.call('POST', `/api/users/${m.b.id}/report`, { token: m.a.token, body: { reason: 'consent', details: 'nerespektoval stop' } });
    assert.equal(res.status, 201);
    assert.equal(t.db.prepare('SELECT status FROM users WHERE id = ?').get(m.b.id).status, 'suspended');
    assert.equal((await t.call('GET', `/api/matches/${m.matchId}`, { token: m.a.token })).status, 410);
  });

  test('hodnocení po schůzce: protějšek ho nevidí, „ohrožení“ pozastaví účet', async () => {
    const m = await t.makeMatch();
    const agreement = await t.confirmedAgreement(m);
    t.db.prepare('UPDATE agreements SET meet_at = ? WHERE id = ?').run(t.inHours(-3), agreement.id);
    const pending = await t.call('GET', '/api/feedback/pending', { token: m.a.token });
    assert.equal(pending.body[0].agreementId, agreement.id);
    const res = await t.call('POST', `/api/feedback/${agreement.id}`, { token: m.a.token, body: { ok: false, reason: 'safety' } });
    assert.equal(res.status, 201);
    assert.equal(t.db.prepare('SELECT status FROM users WHERE id = ?').get(m.b.id).status, 'suspended');
    assert.equal((await t.call('POST', `/api/feedback/${agreement.id}`, { token: m.a.token, body: { ok: true } })).status, 409);
  });

  test('ban platí na osobu – nový účet se stejnou totožností neprojde ověřením', async () => {
    const bad = await t.makeUser({ name: 'Zlouny', lastName: 'Zabanovany', birthdate: '1985-08-08' });
    assert.equal((await t.call('POST', `/api/admin/users/${bad.id}/ban`, { body: {} })).status, 401);
    const ban = await t.call('POST', `/api/admin/users/${bad.id}/ban`, { headers: { Authorization: 'Bearer dev-admin' }, body: { reason: 'násilí' } });
    assert.equal(ban.body.status, 'banned');

    const again = await t.makeUser({ verify: false });
    await t.call('POST', '/api/verification/start', { token: again.token });
    const v = await t.call('POST', '/api/verification/dev-decide', {
      token: again.token,
      body: { firstName: 'Zlouny', lastName: 'Zabanovany', dateOfBirth: '1985-08-08' },
    });
    assert.equal(v.body.status, 'declined');
    assert.match(v.body.message, /zablokovan/);
    assert.equal((await t.call('GET', '/api/me', { token: again.token })).status, 401, 'odhlášený');
    assert.equal(t.db.prepare('SELECT status FROM users WHERE id = ?').get(again.id).status, 'banned');
  });

  test('moderátor čte jen nahlášené konverzace', async () => {
    const m = await t.makeMatch();
    const admin = { headers: { Authorization: 'Bearer dev-admin' } };
    assert.equal((await t.call('GET', `/api/admin/matches/${m.matchId}/messages`, admin)).status, 403);
    await t.call('POST', `/api/matches/${m.matchId}/messages`, { token: m.a.token, body: { text: 'ahoj' } });
    await t.call('POST', `/api/users/${m.a.id}/report`, { token: m.b.token, body: { reason: 'harassment' } });
    const res = await t.call('GET', `/api/admin/matches/${m.matchId}/messages`, admin);
    assert.equal(res.body[0].text, 'ahoj');
  });
});

describe('mazání starých dat', () => {
  test('ukončený bezpečnostní režim zmizí po 7 dnech', async () => {
    const m = await t.makeMatch();
    await t.setSafety(m.a);
    await t.confirmedAgreement(m);
    const start = await t.call('POST', `/api/matches/${m.matchId}/safety`, { token: m.a.token, body: { checkInMinutes: 30 } });
    await t.call('POST', `/api/safety/${start.body.id}/end`, { token: m.a.token, body: { pin: '1234' } });
    purgeOldData(t.db, Date.now() + 8 * 86400_000);
    assert.equal(t.db.prepare('SELECT 1 FROM safety_sessions WHERE id = ?').get(start.body.id), undefined);
  });
});
