import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startTestServer } from './helpers.js';

let t;
before(async () => {
  t = await startTestServer();
});
after(() => t.close());

test('čekací listina: e-mail se uloží zašifrovaný, duplicita nic neprozradí', async () => {
  const body = { email: 'Lucie@Example.cz', city: 'brno', locale: 'de', consent: true };
  assert.equal((await t.call('POST', '/api/waitlist', { body })).status, 201);
  assert.equal((await t.call('POST', '/api/waitlist', { body: { ...body, email: 'lucie@example.cz' } })).status, 201);
  const rows = t.db.prepare('SELECT * FROM waitlist').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].city, 'brno');
  assert.equal(rows[0].locale, 'de');
  assert.ok(!rows[0].email.includes('lucie'));
  const list = await t.call('GET', '/api/admin/waitlist', { headers: { authorization: 'Bearer dev-admin' } });
  assert.equal(list.body[0].email, 'lucie@example.cz');
});

test('čekací listina: bez souhlasu nebo se špatným e-mailem ne', async () => {
  assert.equal((await t.call('POST', '/api/waitlist', { body: { email: 'x@example.cz', consent: false } })).status, 400);
  const bad = await t.call('POST', '/api/waitlist', { body: { email: 'neni-email', consent: true }, headers: { 'Accept-Language': 'en' } });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /email/i);
});

test('čekací listina: CORS jen pro povolený web', async () => {
  t.ctx.config.webOrigins = ['https://fapp.example'];
  const ok = await t.call('OPTIONS', '/api/waitlist', { headers: { Origin: 'https://fapp.example' } });
  assert.equal(ok.raw.headers.get('access-control-allow-origin'), 'https://fapp.example');
  const other = await t.call('OPTIONS', '/api/waitlist', { headers: { Origin: 'https://evil.example' } });
  assert.equal(other.raw.headers.get('access-control-allow-origin'), null);
});
