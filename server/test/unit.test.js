import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSealer, identityHash } from '../src/crypto.js';
import { stripJpegMetadata } from '../src/images.js';
import { moderate } from '../src/services/moderation.js';
import { phone } from '../src/util.js';
import { PHOTO, jpegWithExif } from './helpers.js';

test('moderace: nezletilost', () => {
  for (const text of ['je mi 16', 'Je mi 15 let', 'mám 17 let', 'chodím na střední', 'jsem nezletilá']) {
    assert.equal(moderate(text).action, 'block', text);
    assert.equal(moderate(text).rule, 'minor', text);
  }
  for (const text of ['je mi 30', 'když mi bylo 16 let, …', 'mám 2 děti', 'za 15 minut jsem tam', 'je mi 5 minut cesty']) {
    assert.notEqual(moderate(text).rule, 'minor', text);
  }
});

test('moderace: tlak „v appce jsi souhlasila“', () => {
  for (const text of ['v appce jsi to odsouhlasila', 'Už jsi to potvrdila', 'nemůžeš to vzít zpátky', 'dohoda je dohoda']) {
    assert.equal(moderate(text).rule, 'consent_pressure', text);
    assert.equal(moderate(text).flag, true, text);
  }
  assert.equal(moderate('potvrdila jsi čas?').action, 'allow');
});

test('moderace: placený sex a kontakty', () => {
  assert.equal(moderate('2000 Kč za hodinu').rule, 'paid');
  assert.equal(moderate('hledám sponzora').rule, 'paid');
  assert.equal(moderate('napiš na WhatsApp').action, 'warn');
  assert.equal(moderate('moje číslo 777 123 456').action, 'warn');
  assert.equal(moderate('nemám tady signál').action, 'allow');
  assert.equal(moderate('Ahoj, co večer?').action, 'allow');
});

test('JPEG: metadata pryč, obraz zůstane', () => {
  const clean = stripJpegMetadata(jpegWithExif());
  assert.equal(clean.includes(Buffer.from('GPS')), false);
  assert.ok(clean.equals(stripJpegMetadata(PHOTO)));
  assert.throws(() => stripJpegMetadata(Buffer.from('not a jpeg')));
});

test('šifrování textů', () => {
  const s = createSealer(Buffer.alloc(32, 3).toString('base64'));
  const sealed = s.seal('stopslovo Ananas');
  assert.notEqual(sealed, s.seal('stopslovo Ananas'), 'náhodné IV');
  assert.equal(s.open(sealed), 'stopslovo Ananas');
  assert.equal(s.open(''), '');
});

test('otisk identity ignoruje diakritiku a velikost písmen', () => {
  assert.equal(identityHash('k', 'Dvořák', 'Jiří'), identityHash('k', 'DVORAK', ' jiri '));
  assert.notEqual(identityHash('k', 'Dvořák'), identityHash('jiny-klic', 'Dvořák'));
});

test('telefon se normalizuje na mezinárodní formát', () => {
  assert.equal(phone('777 123 456', 't'), '+420777123456');
  assert.equal(phone('00421 905 123 456', 't'), '+421905123456');
  assert.throws(() => phone('123', 't'));
});
