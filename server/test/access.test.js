import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startTestServer } from './helpers.js';

const KEY = 'tajny-klic-pro-testery';
const basic = (password) => `Basic ${Buffer.from(`kdokoli:${password}`).toString('base64')}`;

let t;
before(async () => {
  t = await startTestServer({ env: { ACCESS_KEY: KEY } });
});
after(() => t.close());

test('uzavřený provoz: API bez klíče vypadá jako prázdný server', async () => {
  const none = await t.call('POST', '/api/auth/register', { body: {} });
  assert.equal(none.status, 404);
  assert.equal((await t.call('POST', '/api/auth/register', { body: {}, headers: { 'X-Access-Key': 'spatny' } })).status, 404);
  assert.equal(none.raw.headers.get('x-robots-tag'), 'noindex, nofollow');
  // Se správným klíčem projde až na běžnou validaci.
  const ok = await t.call('POST', '/api/auth/register', { body: {}, headers: { 'X-Access-Key': KEY } });
  assert.equal(ok.status, 400);
});

test('uzavřený provoz: web chce heslo, stránka z SMS a webhooky zůstávají volné', async () => {
  const web = await t.call('GET', '/');
  assert.equal(web.status, 401);
  assert.match(web.raw.headers.get('www-authenticate'), /^Basic/);
  assert.equal((await t.call('GET', '/', { headers: { Authorization: basic('spatne') } })).status, 401);
  assert.notEqual((await t.call('GET', '/', { headers: { Authorization: basic(KEY) } })).status, 401);

  assert.equal((await t.call('GET', '/health')).status, 200);
  assert.equal((await t.call('GET', '/api/share/i18n/cs')).status, 200);
  assert.notEqual((await t.call('GET', '/s/neexistujici-token')).status, 401);
  assert.notEqual((await t.call('POST', '/api/billing/webhook/revenuecat', { body: {} })).status, 404);
});
