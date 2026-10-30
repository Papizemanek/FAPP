import { readFileSync } from 'node:fs';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db.js';
import { createModerator } from '../src/moderators.js';
import { totpAt } from '../src/security.js';
import { memoryEmail } from '../src/services/email.js';
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

export async function startTestServer({ env = {} } = {}) {
  const config = { ...loadConfig({ NODE_ENV: 'test', DATA_KEY: Buffer.alloc(32, 1).toString('base64'), ...env }), dev: true };
  const db = openDb(':memory:');
  const services = { sms: memorySms(), push: memoryPush(), verification: devVerification(), email: memoryEmail() };
  const { app, ctx } = createApp({ db, config, services, rateLimit: false });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  config.publicUrl = base;
  config.shareUrl = base;

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
  /** Registruje, ověří, nahraje fotku a nastaví polohu – uživatel připravený na swipe. headers jen pro registraci (jazyk). */
  async function makeUser({
    name = `User${++counter}`,
    gender = 'woman',
    interestedIn = ['man', 'woman', 'nonbinary'],
    birthdate = '1995-05-05',
    verify = true,
    lastName = `Prijmeni${counter}`,
    lat = 50.08,
    lng = 14.42,
    headers = {},
  } = {}) {
    const email = `${name.toLowerCase()}${counter}@test.cz`;
    const reg = await register({ email, password: 'tajne-heslo-123', name, birthdate, gender, interestedIn }, headers);
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

  /** Poslední kód z e-mailu pro danou adresu (registrace, obnova hesla). */
  const lastCode = (address) => {
    const mail = services.email.sent.filter((m) => m.to === address).at(-1);
    return mail?.text.match(/\b(\d{6})\b/)?.[1] ?? null;
  };

  /** Registrace celá: údaje → kód z e-mailu → účet. */
  async function register(body, headers = {}) {
    const start = await call('POST', '/api/auth/register', { headers, body: { confirmAdult: true, acceptRules: true, ...body } });
    if (start.status !== 202) throw new Error(`register ${start.status} ${JSON.stringify(start.body)}`);
    const reg = await call('POST', '/api/auth/register/verify', { headers, body: { email: body.email, code: lastCode(body.email) } });
    if (reg.status !== 201) throw new Error(`register verify ${reg.status} ${JSON.stringify(reg.body)}`);
    return reg;
  }

  // Moderátor pro testy moderátorského API (heslo + TOTP → token).
  const moderator = createModerator(db, { email: 'mod@test.cz', name: 'Moderátor', password: 'moderatorske-heslo-123' });
  let adminToken = null;
  async function adminHeaders() {
    if (!adminToken) {
      const res = await call('POST', '/api/admin/login', {
        body: { email: 'mod@test.cz', password: 'moderatorske-heslo-123', code: totpAt(moderator.secret, Math.floor(Date.now() / 30_000)) },
      });
      if (res.status !== 200) throw new Error(`admin login ${res.status}`);
      adminToken = res.body.token;
    }
    return { Authorization: `Bearer ${adminToken}` };
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

  // Jeden pevný čas schůzky pro celý běh – v aplikaci druhý z dvojice dostane čas předvyplněný.
  const defaultMeetAt = new Date(Date.now() + 2 * 3600_000).toISOString();

  /** Uloží domluvu za jednoho z dvojice (vlastní přání + společné praktické věci + obě potvrzovací věty). */
  function saveAgreement(user, matchId, overrides = {}) {
    return call('POST', `/api/matches/${matchId}/agreement`, {
      token: user.token,
      body: {
        meetAt: defaultMeetAt,
        place: 'U Lucie',
        condom: true,
        sober: true,
        publicFirst: false,
        safeword: 'Ananas',
        wishes: { kissing: 'yes', oral: 'yes' },
        note: '',
        intent: true,
        notice: true,
        ...overrides,
      },
    });
  }

  async function confirmedAgreement({ a, b, matchId }, overrides = {}) {
    await saveAgreement(a, matchId, overrides);
    return (await saveAgreement(b, matchId, overrides)).body;
  }

  /** Match mezi dvěma existujícími uživateli. */
  async function matchUsers(x, y) {
    await call('POST', '/api/swipes', { token: x.token, body: { targetId: y.id, like: true } });
    const res = await call('POST', '/api/swipes', { token: y.token, body: { targetId: x.id, like: true } });
    return res.body.match.id;
  }

  return {
    base,
    db,
    ctx,
    services,
    call,
    /** Řádek přímo z databáze bez automatického dešifrování (kontrola šifrování v klidu). */
    rawGet: (sql, ...args) => db.prepare(sql).raw.get(...args),
    rawAll: (sql, ...args) => db.prepare(sql).raw.all(...args),
    register,
    lastCode,
    adminHeaders,
    makeUser,
    makeMatch,
    setSafety,
    saveAgreement,
    confirmedAgreement,
    matchUsers,
    inHours,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
