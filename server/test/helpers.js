import { readFileSync } from 'node:fs';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db.js';
import { memoryPush } from '../src/services/push.js';
import { memorySms } from '../src/services/sms.js';
import { devVerification } from '../src/services/verification.js';

export const PHOTO = readFileSync(new URL('../seed/lucie.jpg', import.meta.url));

/** JPEG s vloženým EXIF segmentem, který obsahuje „GPS“ – na ověření, že ho server odstraní. */
export function jpegWithExif() {
  const payload = Buffer.from('Exif\0\0GPSLatitude=50.0875;GPSLongitude=14.4213', 'binary');
  const header = Buffer.from([0xff, 0xe1, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([PHOTO.subarray(0, 2), header, payload, PHOTO.subarray(2)]);
}

export async function startTestServer() {
  const config = { ...loadConfig({ NODE_ENV: 'test', DATA_KEY: Buffer.alloc(32, 1).toString('base64') }), dev: true };
  const db = openDb(':memory:');
  const services = { sms: memorySms(), push: memoryPush(), verification: devVerification() };
  const { app, ctx } = createApp({ db, config, services, rateLimit: false });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  config.publicUrl = base;

  async function call(method, path, { token, body, headers = {} } = {}) {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, body: json, raw: res };
  }

  let counter = 0;
  /** Registruje, ověří, nahraje fotku a nastaví polohu – uživatel připravený na swipe. */
  async function makeUser({
    name = `User${++counter}`,
    gender = 'woman',
    interestedIn = ['man', 'woman', 'nonbinary'],
    birthdate = '1995-05-05',
    verify = true,
    lastName = `Prijmeni${counter}`,
    lat = 50.08,
    lng = 14.42,
  } = {}) {
    const email = `${name.toLowerCase()}${counter}@test.cz`;
    const reg = await call('POST', '/api/auth/register', {
      body: { email, password: 'tajne-heslo-123', name, birthdate, gender, interestedIn, confirmAdult: true, acceptRules: true },
    });
    if (reg.status !== 201) throw new Error(`register ${reg.status} ${JSON.stringify(reg.body)}`);
    const token = reg.body.token;
    if (verify) {
      await call('POST', '/api/verification/start', { token });
      const v = await call('POST', '/api/verification/dev-decide', { token, body: { firstName: name, lastName, dateOfBirth: birthdate } });
      if (v.body.status !== 'approved') throw new Error(`verify ${JSON.stringify(v.body)}`);
      await call('POST', '/api/me/photos', { token, body: { jpegBase64: PHOTO.toString('base64') } });
      await call('PUT', '/api/me/location', { token, body: { lat, lng } });
    }
    return { token, id: reg.body.user.id, name, email };
  }

  async function makeMatch(opts = {}) {
    const a = await makeUser({ gender: 'woman', interestedIn: ['man'], ...opts.a });
    const b = await makeUser({ gender: 'man', interestedIn: ['woman'], ...opts.b });
    await call('POST', '/api/swipes', { token: a.token, body: { targetId: b.id, like: true } });
    const res = await call('POST', '/api/swipes', { token: b.token, body: { targetId: a.id, like: true } });
    return { a, b, matchId: res.body.match.id };
  }

  async function setSafety(user, { checkinPin = '1234', duressPin = '9999' } = {}) {
    return call('PUT', '/api/me/safety', {
      token: user.token,
      body: { trustedName: 'Petra', trustedPhone: '777 123 456', checkinPin, duressPin, discreet: false, password: 'tajne-heslo-123' },
    });
  }

  const inHours = (h) => new Date(Date.now() + h * 3600_000).toISOString();

  async function confirmedAgreement({ a, b, matchId }, overrides = {}) {
    const proposal = await call('POST', `/api/matches/${matchId}/agreement`, {
      token: a.token,
      body: {
        meetAt: inHours(2),
        place: 'U Lucie',
        activities: ['kissing', 'oral'],
        condom: true,
        sober: true,
        safeword: 'Ananas',
        consent: true,
        ...overrides,
      },
    });
    const confirm = await call('POST', `/api/agreements/${proposal.body.id}/confirm`, {
      token: b.token,
      body: { version: proposal.body.version, consent: true },
    });
    return confirm.body;
  }

  return {
    base,
    db,
    ctx,
    services,
    call,
    makeUser,
    makeMatch,
    setSafety,
    confirmedAgreement,
    inHours,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
