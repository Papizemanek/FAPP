import { Router } from 'express';
import { PLANS } from '../../../shared/constants.js';
import { refreshPlan } from '../billing.js';
import { emailIndex, tokenHash } from '../crypto.js';
import { getUser, ownProfile } from '../model.js';
import { DUMMY_PASSWORD_HASH, assertNotLocked, clearFailures, recordFailure, verifyTotp } from '../security.js';
import { HttpError, int, nowIso, str, token, verifySecret } from '../util.js';

// Moderátorské API (zatím bez UI). Každý moderátor má vlastní účet: e-mail + heslo + kód z autentizační
// aplikace (TOTP) → přihlášení na 12 hodin. Každý požadavek se zapisuje do auditu (kdo, co, kdy, odkud).
// Volitelně jen z povolených IP adres (ADMIN_IPS).
// Moderátor smí číst jen konverzace, které někdo nahlásil nebo které zachytila moderace.
const ADMIN_SESSION_MS = 12 * 3600_000;

export function adminRoutes({ db, config, sealer, limiter }) {
  const r = Router();
  const audit = (req, action, target = '') =>
    db.prepare('INSERT INTO audit_log (moderator_id, action, target, ip, at) VALUES (?, ?, ?, ?, ?)').run(
      req.moderator?.id ?? null,
      action,
      String(target).slice(0, 200),
      String(req.ip ?? ''),
      nowIso(),
    );

  r.use((req, _res, next) => {
    if (config.adminIps.length > 0 && !config.adminIps.includes(req.ip)) throw new HttpError(404, 'errors.notFound');
    next();
  });

  r.post('/login', limiter('admin-login', 5), (req, res) => {
    const address = String(req.body?.email ?? '').trim().toLowerCase().slice(0, 200);
    const key = `mod:${emailIndex(db.emailIndexKey, address)}`;
    assertNotLocked(db, key);
    const mod = db.prepare('SELECT * FROM moderators WHERE email_hash = ? AND disabled_at IS NULL').get(emailIndex(db.emailIndexKey, address));
    const passwordOk = verifySecret(req.body?.password, mod?.password_hash ?? DUMMY_PASSWORD_HASH);
    const step = mod && passwordOk ? verifyTotp(mod.totp_secret, req.body?.code, mod.totp_last_step) : null;
    if (!step) {
      recordFailure(db, key);
      audit(req, 'login.failed', address);
      throw new HttpError(401, 'errors.unauthorized');
    }
    clearFailures(db, key);
    db.prepare('UPDATE moderators SET totp_last_step = ? WHERE id = ?').run(step, mod.id);
    const t = token(32);
    db.prepare('INSERT INTO admin_sessions (token_hash, moderator_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
      tokenHash(t),
      mod.id,
      nowIso(),
      new Date(Date.now() + ADMIN_SESSION_MS).toISOString(),
    );
    req.moderator = mod;
    audit(req, 'login');
    res.json({ token: t, expiresInSeconds: ADMIN_SESSION_MS / 1000 });
  });

  r.use((req, _res, next) => {
    const given = (req.get('authorization') ?? '').replace(/^Bearer /, '');
    const session = given && db.prepare('SELECT * FROM admin_sessions WHERE token_hash = ?').get(tokenHash(given));
    const mod = session && Date.parse(session.expires_at) > Date.now()
      ? db.prepare('SELECT * FROM moderators WHERE id = ? AND disabled_at IS NULL').get(session.moderator_id)
      : null;
    if (!mod) throw new HttpError(401, 'errors.unauthorized');
    req.moderator = mod;
    req.adminSession = session;
    audit(req, `${req.method} ${req.path}`);
    next();
  });

  r.post('/logout', (req, res) => {
    db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(req.adminSession.token_hash);
    res.status(204).end();
  });

  // Audit čte každý moderátor – vzájemná kontrola.
  r.get('/audit', (req, res) => {
    const rows = db
      .prepare('SELECT a.*, m.name AS moderator FROM audit_log a LEFT JOIN moderators m ON m.id = a.moderator_id ORDER BY a.id DESC LIMIT 500')
      .all();
    res.json(rows);
  });

  const userId = (req) => int(req.params.id, 'fields.user', { min: 1, max: Number.MAX_SAFE_INTEGER });

  r.get('/flags', (req, res) => {
    const rows = db
      .prepare(
        `SELECT f.*, u.name, u.status FROM flags f LEFT JOIN users u ON u.id = f.user_id
         WHERE (? = 1 OR f.resolved_at IS NULL)
         ORDER BY CASE f.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, f.id DESC LIMIT 200`,
      )
      .all(req.query.all === '1' ? 1 : 0);
    res.json(rows.map((f) => ({ ...f, details: f.details.startsWith('v1:') ? sealer.openText(f.details) : f.details })));
  });

  r.post('/flags/:id/resolve', (req, res) => {
    db.prepare('UPDATE flags SET resolved_at = ?, resolution = ? WHERE id = ?').run(
      nowIso(),
      str(req.body?.resolution, 'fields.resolution', { max: 500, optional: true }),
      Number(req.params.id),
    );
    res.status(204).end();
  });

  r.get('/users/:id', (req, res) => {
    const user = getUser(db, userId(req));
    if (!user) throw new HttpError(404, 'users.notFound');
    res.json({
      profile: { ...ownProfile(user), statusReason: user.status_reason },
      reports: db
        .prepare('SELECT * FROM reports WHERE reported_id = ? ORDER BY id DESC')
        .all(user.id)
        .map((x) => ({ ...x, details: sealer.openText(x.details) })),
      negativeFeedback: db
        .prepare('SELECT * FROM feedback WHERE about_id = ? AND ok = 0 ORDER BY created_at DESC')
        .all(user.id)
        .map((x) => ({ ...x, details: sealer.openText(x.details) })),
      flags: db.prepare('SELECT * FROM flags WHERE user_id = ? ORDER BY id DESC').all(user.id),
    });
  });

  r.get('/matches/:id/messages', (req, res) => {
    const matchId = Number(req.params.id);
    const reported =
      db.prepare('SELECT 1 FROM reports WHERE match_id = ?').get(matchId) ||
      db.prepare("SELECT 1 FROM flags WHERE source = 'chat' AND ref_id = ?").get(matchId);
    if (!reported) throw new HttpError(403, 'admin.notReported');
    const rows = db.prepare('SELECT * FROM messages WHERE match_id = ? ORDER BY id').all(matchId);
    res.json(rows.map((m) => ({ id: m.id, senderId: m.sender_id, text: sealer.openText(m.body), imageId: m.image_id, createdAt: m.created_at })));
  });

  const setStatus = (status) => (req, res) => {
    const user = getUser(db, userId(req));
    if (!user) throw new HttpError(404, 'users.notFound');
    const reason = str(req.body?.reason, 'fields.reason', { max: 500, optional: true });
    db.prepare('UPDATE users SET status = ?, status_reason = ? WHERE id = ?').run(status, reason, user.id);
    if (status === 'banned') {
      const ban = db.prepare('INSERT OR IGNORE INTO banned_identities (hash, reason, created_at) VALUES (?, ?, ?)');
      for (const hash of [user.person_hash, user.document_hash].filter(Boolean)) ban.run(hash, reason, nowIso());
      db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(user.id);
    }
    if (status === 'active') {
      db.prepare('DELETE FROM banned_identities WHERE hash IN (?, ?)').run(user.person_hash ?? '', user.document_hash ?? '');
    }
    res.json({ id: user.id, status });
  };

  r.post('/users/:id/suspend', setStatus('suspended'));
  r.post('/users/:id/ban', setStatus('banned'));
  r.post('/users/:id/reinstate', setStatus('active'));

  // Čekací listina pro rozeslání pozvánek (jen moderátoři/správci).
  r.get('/waitlist', (req, res) => {
    const rows = db.prepare('SELECT id, email, city, locale, created_at FROM waitlist ORDER BY id').all();
    res.json(rows.map((w) => ({ ...w, email: sealer.openText(w.email) })));
  });

  // Předplatné zdarma pro testery a partnery: { plan: 'gold', days: 30 }. plan 'free' ukončí všechna taková darovaná.
  r.post('/users/:id/plan', (req, res) => {
    const user = getUser(db, userId(req));
    if (!user) throw new HttpError(404, 'users.notFound');
    const plan = String(req.body?.plan ?? '');
    if (!Object.hasOwn(PLANS, plan)) throw new HttpError(400, 'admin.unknownPlan');
    const now = nowIso();
    if (plan === 'free') {
      db.prepare("UPDATE subscriptions SET expires_at = ?, updated_at = ? WHERE user_id = ? AND source = 'admin' AND expires_at > ?").run(now, now, user.id, now);
    } else {
      const days = int(req.body?.days, 'fields.days', { min: 1, max: 3660 });
      db.prepare(
        `INSERT INTO subscriptions (user_id, plan, product_id, source, expires_at, created_at, updated_at)
         VALUES (?, ?, 'admin', 'admin', ?, ?, ?)`,
      ).run(user.id, plan, new Date(Date.now() + days * 86400_000).toISOString(), now, now);
    }
    refreshPlan(db, user.id);
    const fresh = getUser(db, user.id);
    res.json({ id: user.id, plan: fresh.plan, planExpiresAt: fresh.plan_expires_at });
  });

  return r;
}
