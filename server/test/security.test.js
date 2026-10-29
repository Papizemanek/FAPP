import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { after, before, describe, test } from 'node:test';
import { loadConfig } from '../src/config.js';
import { createSealer, tokenHash } from '../src/crypto.js';
import { enableSealing, openDb, rotateKeys } from '../src/db.js';
import { totpAt } from '../src/security.js';
import { startTestServer } from './helpers.js';

let t;
before(async () => {
  t = await startTestServer();
});
after(() => t.close());

const nowCode = (secret) => totpAt(secret, Math.floor(Date.now() / 30_000));
const profile = { password: 'tajne-heslo-123', name: 'Tester', birthdate: '1994-04-04', gender: 'woman', interestedIn: ['man'] };

describe('účty nejdou zjistit (enumerace)', () => {
  test('registrace s existujícím e-mailem odpoví stejně a pošle jen upozornění', async () => {
    const u = await t.makeUser({ verify: false });
    const again = await t.call('POST', '/api/auth/register', { body: { ...profile, email: u.email, confirmAdult: true, acceptRules: true } });
    const fresh = await t.call('POST', '/api/auth/register', { body: { ...profile, email: 'novy@test.cz', confirmAdult: true, acceptRules: true } });
    assert.equal(again.status, 202);
    assert.deepEqual(again.body, fresh.body);
    const mail = t.services.email.sent.filter((m) => m.to === u.email).at(-1);
    assert.match(mail.subject, /Pokus o registraci/);
    assert.equal(/\d{6}/.test(mail.text), false, 'existující účet nedostane registrační kód');
  });

  test('obnova hesla odpoví stejně pro existující i neexistující e-mail', async () => {
    const u = await t.makeUser({ verify: false });
    const a = await t.call('POST', '/api/auth/password/forgot', { body: { email: u.email } });
    const b = await t.call('POST', '/api/auth/password/forgot', { body: { email: 'nikdo@test.cz' } });
    assert.equal(a.status, b.status);
    assert.deepEqual(a.body, b.body);
    assert.equal(t.services.email.sent.some((m) => m.to === 'nikdo@test.cz'), false);
  });

  test('zámek po opakovaných pokusech platí i pro neexistující e-mail', async () => {
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await t.call('POST', '/api/auth/login', { body: { email: 'neexistuje@test.cz', password: 'spatne-heslo' } })).status);
    }
    assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429]);
  });

  test('zámek hesla: po 5 chybách nepomůže ani správné heslo', async () => {
    const u = await t.makeUser({ verify: false });
    for (let i = 0; i < 5; i++) await t.call('POST', '/api/auth/login', { body: { email: u.email, password: 'spatne-heslo' } });
    const res = await t.call('POST', '/api/auth/login', { body: { email: u.email, password: 'tajne-heslo-123' } });
    assert.equal(res.status, 429);
  });
});

describe('kódy z e-mailu', () => {
  test('po 5 špatných pokusech kód přestane platit', async () => {
    const email = 'kody@test.cz';
    await t.call('POST', '/api/auth/register', { body: { ...profile, email, confirmAdult: true, acceptRules: true } });
    const code = t.lastCode(email);
    for (let i = 0; i < 5; i++) {
      const wrong = String((Number(code) + 1 + i) % 1_000_000).padStart(6, '0');
      assert.equal((await t.call('POST', '/api/auth/register/verify', { body: { email, code: wrong } })).status, 400);
    }
    assert.equal((await t.call('POST', '/api/auth/register/verify', { body: { email, code } })).status, 400);
  });

  test('obnova hesla: nové heslo platí, staré přihlášení se zruší', async () => {
    const u = await t.makeUser({ verify: false });
    await t.call('POST', '/api/auth/password/forgot', { body: { email: u.email } });
    const reset = await t.call('POST', '/api/auth/password/reset', {
      body: { email: u.email, code: t.lastCode(u.email), password: 'uplne-nove-heslo-1' },
    });
    assert.equal(reset.status, 204);
    assert.equal((await t.call('GET', '/api/me', { token: u.token })).status, 401);
    assert.equal((await t.call('POST', '/api/auth/login', { body: { email: u.email, password: 'uplne-nove-heslo-1' } })).status, 200);
    assert.match(t.services.email.sent.at(-2).subject, /Heslo bylo změněno/);
  });
});

describe('přihlášení a zařízení', () => {
  test('token je v databázi jen jako otisk a odhlášení ho zneplatní', async () => {
    const u = await t.makeUser({ verify: false });
    assert.equal(t.db.prepare('SELECT 1 FROM auth_sessions WHERE token_hash = ?').get(u.token), undefined);
    assert.ok(t.db.prepare('SELECT 1 FROM auth_sessions WHERE token_hash = ?').get(tokenHash(u.token)));
    await t.call('POST', '/api/auth/logout', { token: u.token });
    assert.equal((await t.call('GET', '/api/me', { token: u.token })).status, 401);
  });

  test('vypršelé přihlášení neplatí', async () => {
    const u = await t.makeUser({ verify: false });
    t.db.prepare('UPDATE auth_sessions SET expires_at = ? WHERE token_hash = ?').run('2000-01-01T00:00:00.000Z', tokenHash(u.token));
    assert.equal((await t.call('GET', '/api/me', { token: u.token })).status, 401);
  });

  test('seznam zařízení, odhlášení ostatních a změna hesla', async () => {
    const u = await t.makeUser({ verify: false });
    const second = (await t.call('POST', '/api/auth/login', { body: { email: u.email, password: 'tajne-heslo-123' }, headers: { 'X-Device': 'iPhone 15' } })).body.token;
    const list = await t.call('GET', '/api/me/sessions', { token: u.token });
    assert.equal(list.body.length, 2);
    assert.ok(list.body.some((s) => s.device === 'iPhone 15' && !s.current));
    assert.match(t.services.email.sent.at(-1).subject, /Nové přihlášení/);

    assert.equal((await t.call('PUT', '/api/me/password', { token: u.token, body: { password: 'spatne', newPassword: 'nove-heslo-12345' } })).status, 403);
    assert.equal((await t.call('PUT', '/api/me/password', { token: u.token, body: { password: 'tajne-heslo-123', newPassword: 'nove-heslo-12345' } })).status, 204);
    assert.equal((await t.call('GET', '/api/me', { token: second })).status, 401, 'druhé zařízení se odhlásilo');
    assert.equal((await t.call('GET', '/api/me', { token: u.token })).status, 200, 'tohle zařízení zůstává');
  });
});

describe('dvoufázové ověření', () => {
  test('zapnutí, přihlášení s kódem, záložní kód jen jednou, vypnutí', async () => {
    const u = await t.makeUser({ verify: false });
    const setup = await t.call('POST', '/api/me/2fa/setup', { token: u.token, body: { password: 'tajne-heslo-123' } });
    assert.match(setup.body.otpauthUrl, /^otpauth:\/\/totp\//);
    assert.equal((await t.call('POST', '/api/me/2fa/enable', { token: u.token, body: { code: '000000' } })).status, 400);
    const enable = await t.call('POST', '/api/me/2fa/enable', { token: u.token, body: { code: nowCode(setup.body.secret) } });
    assert.equal(enable.body.recoveryCodes.length, 10);
    assert.equal(enable.body.user.twoFactor, true);
    const stored = t.rawGet('SELECT totp_secret FROM users WHERE id = ?', u.id).totp_secret;
    assert.ok(!stored.includes(setup.body.secret), 'TOTP klíč je v DB zašifrovaný');

    const login = await t.call('POST', '/api/auth/login', { body: { email: u.email, password: 'tajne-heslo-123' } });
    assert.equal(login.body.twoFactor, true);
    assert.equal(login.body.token, undefined);
    // Stejný kód podruhé neprojde (replay) – použijeme záložní kód.
    const [recovery] = enable.body.recoveryCodes;
    const ok = await t.call('POST', '/api/auth/login/2fa', { body: { challenge: login.body.challenge, code: recovery } });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.token);
    const login2 = await t.call('POST', '/api/auth/login', { body: { email: u.email, password: 'tajne-heslo-123' } });
    assert.equal((await t.call('POST', '/api/auth/login/2fa', { body: { challenge: login2.body.challenge, code: recovery } })).status, 400);

    const [, other] = enable.body.recoveryCodes;
    const off = await t.call('POST', '/api/me/2fa/disable', { token: u.token, body: { password: 'tajne-heslo-123', code: other } });
    assert.equal(off.body.user.twoFactor, false);
  });

  test('výzva k druhému kroku vydrží jen 5 pokusů', async () => {
    const u = await t.makeUser({ verify: false });
    const setup = await t.call('POST', '/api/me/2fa/setup', { token: u.token, body: { password: 'tajne-heslo-123' } });
    await t.call('POST', '/api/me/2fa/enable', { token: u.token, body: { code: nowCode(setup.body.secret) } });
    const login = await t.call('POST', '/api/auth/login', { body: { email: u.email, password: 'tajne-heslo-123' } });
    for (let i = 0; i < 5; i++) await t.call('POST', '/api/auth/login/2fa', { body: { challenge: login.body.challenge, code: '123456' } });
    const res = await t.call('POST', '/api/auth/login/2fa', { body: { challenge: login.body.challenge, code: 'aaaaa-bbbbb' } });
    assert.equal(res.status, 401);
  });
});

describe('šifrování v klidu', () => {
  test('citlivé údaje profilu a fotky nejsou v databázi čitelné', async () => {
    const u = await t.makeUser({ name: 'Rozálie' });
    await t.call('PUT', '/api/me', {
      token: u.token,
      body: { name: 'Rozálie', bio: 'Tajné bio', gender: 'woman', interestedIn: ['woman'], tags: ['kink'], ageMin: 18, ageMax: 40, maxDistanceKm: 20 },
    });
    const row = t.rawGet('SELECT * FROM users WHERE id = ?', u.id);
    for (const column of ['email', 'name', 'birthdate', 'gender', 'interested_in', 'bio', 'tags', 'lat', 'lng']) {
      assert.match(String(row[column]), /^v1n?:/, `${column} je zašifrovaný`);
    }
    assert.equal(JSON.stringify(row).includes('Rozálie'), false);
    const img = t.rawGet('SELECT data FROM images WHERE owner_id = ?', u.id);
    assert.equal(Buffer.from(img.data).subarray(0, 3).toString(), 'YYE');
    const me = await t.call('GET', '/api/me', { token: u.token });
    assert.equal(me.body.name, 'Rozálie');
    assert.deepEqual(me.body.tags, ['kink']);
  });

  test('starší nezašifrovaná data se při startu zašifrují a rotace klíče je přešifruje', () => {
    const file = `${mkdtempSync(`${tmpdir()}/yy-`)}/db.sqlite`;
    const plain = openDb(file);
    plain
      .prepare(
        `INSERT INTO users (email, password_hash, name, birthdate, gender, interested_in, lat, lng, created_at)
         VALUES ('stara@test.cz', 'x', 'Stará', '1990-01-01', 'woman', '["man"]', 50.08, 14.42, '2026-01-01')`,
      )
      .run();
    plain.close();
    const k1 = Buffer.alloc(32, 3).toString('base64');
    const k2 = Buffer.alloc(32, 4).toString('base64');
    const config = loadConfig({ NODE_ENV: 'test', DATA_KEY: k1 });
    const db = enableSealing(openDb(file), createSealer(k1), { emailIndexKey: config.emailIndexKey });
    const raw = db.prepare('SELECT * FROM users').raw.get();
    assert.match(raw.name, /^v1:/);
    assert.match(raw.lat, /^v1n:/);
    assert.ok(raw.email_hash);
    db.close();

    const rotated = enableSealing(openDb(file), createSealer(`v2:${k2},v1:${k1}`), { emailIndexKey: config.emailIndexKey });
    assert.ok(rotateKeys(rotated) >= 7);
    assert.match(rotated.prepare('SELECT name FROM users').raw.get().name, /^v2:/);
    rotated.close();
    const onlyNew = enableSealing(openDb(file), createSealer(`v2:${k2}`), { emailIndexKey: config.emailIndexKey });
    const user = onlyNew.prepare('SELECT * FROM users').get();
    assert.equal(user.name, 'Stará');
    assert.equal(user.lat, 50.08);
    onlyNew.close();
  });
});

describe('webová verze: přihlášení v cookie', () => {
  test('cookie je HttpOnly + SameSite=Strict a změny vyžadují hlavičku proti CSRF', async () => {
    const u = await t.makeUser({ verify: false });
    const res = await t.call('POST', '/api/auth/login', { headers: { 'X-Client': 'web' }, body: { email: u.email, password: 'tajne-heslo-123' } });
    assert.equal(res.body.token, 'cookie', 'token se do JavaScriptu nedostane');
    const setCookie = res.raw.headers.get('set-cookie');
    assert.match(setCookie, /yy_session=[^;]+; Path=\/api; Max-Age=\d+; HttpOnly; SameSite=Strict/);
    const cookie = setCookie.split(';')[0];
    assert.equal((await t.call('GET', '/api/me', { headers: { Cookie: cookie } })).status, 200);
    const body = { name: 'Xena', gender: 'woman', interestedIn: ['man'], ageMin: 18, ageMax: 40, maxDistanceKm: 20 };
    assert.equal((await t.call('PUT', '/api/me', { headers: { Cookie: cookie }, body })).status, 401, 'bez hlavičky změna neprojde');
    assert.equal(
      (await t.call('PUT', '/api/me', { headers: { Cookie: cookie, 'X-Requested-With': 'yesyes', Authorization: 'Bearer cookie' }, body })).status,
      200,
    );
  });
});

describe('hlavičky a limity', () => {
  test('API má přísnou CSP, stránka pro důvěryhodnou osobu povoluje jen své skripty', async () => {
    const health = await t.call('GET', '/health');
    assert.match(health.raw.headers.get('content-security-policy'), /default-src 'none'/);
    assert.equal(health.raw.headers.get('x-frame-options'), 'DENY');
    const m = await t.makeMatch();
    await t.setSafety(m.a);
    await t.confirmedAgreement(m);
    const start = await t.call('POST', `/api/matches/${m.matchId}/safety`, { token: m.a.token, body: { checkInMinutes: 30 } });
    const page = await t.call('GET', `/s/${start.body.shareUrl.split('/s/')[1]}`);
    const csp = page.raw.headers.get('content-security-policy');
    assert.match(csp, /script-src 'self' 'sha256-/);
    assert.doesNotMatch(csp, /unsafe-inline'[^;]*;?\s*$|script-src[^;]*unsafe-inline/);
  });

  test('security.txt je dostupný', async () => {
    const res = await t.call('GET', '/.well-known/security.txt');
    assert.match(res.body, /Contact: mailto:/);
  });

  test('velké tělo požadavku mimo nahrávání fotek server odmítne', async () => {
    const res = await t.call('POST', '/api/auth/login', { body: { email: 'x@test.cz', password: 'a'.repeat(100_000) } });
    assert.equal(res.status, 413);
  });

  test('vývojový režim na veřejné adrese bez přístupového klíče nenastartuje', () => {
    assert.throws(() => loadConfig({ PUBLIC_URL: 'https://yesyes.example.com' }), /ACCESS_KEY/);
    assert.doesNotThrow(() => loadConfig({ PUBLIC_URL: 'https://yesyes.example.com', ACCESS_KEY: 'x'.repeat(48) }));
  });
});

describe('moderátoři', () => {
  test('bez přihlášení nic, špatný TOTP nic, každý přístup je v auditu', async () => {
    assert.equal((await t.call('GET', '/api/admin/flags')).status, 401);
    const wrong = await t.call('POST', '/api/admin/login', { body: { email: 'mod@test.cz', password: 'moderatorske-heslo-123', code: '000000' } });
    assert.equal(wrong.status, 401);
    const headers = await t.adminHeaders();
    assert.equal((await t.call('GET', '/api/admin/flags', { headers })).status, 200);
    const audit = await t.call('GET', '/api/admin/audit', { headers });
    const actions = audit.body.map((a) => a.action);
    assert.ok(actions.includes('GET /flags'));
    assert.ok(actions.includes('login.failed'));
    assert.equal(audit.body.find((a) => a.action === 'GET /flags').moderator, 'Moderátor');
  });
});
