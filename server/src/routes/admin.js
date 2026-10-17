import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { PLANS } from '../../../shared/constants.js';
import { refreshPlan } from '../billing.js';
import { getUser, ownProfile } from '../model.js';
import { HttpError, int, nowIso, str } from '../util.js';

// Moderátorské API (zatím bez UI). Autorizace: Authorization: Bearer <ADMIN_TOKEN>.
// Chyby jsou překladové klíče jako všude jinde (admin.* má zatím jen čeština a angličtina).
// Moderátor smí číst jen konverzace, které někdo nahlásil nebo které zachytila moderace.
export function adminRoutes({ db, config, sealer }) {
  const r = Router();

  r.use((req, _res, next) => {
    const given = Buffer.from((req.get('authorization') ?? '').replace(/^Bearer /, ''));
    const expected = Buffer.from(config.adminToken);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new HttpError(401, 'errors.unauthorized');
    next();
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
    res.json(rows.map((f) => ({ ...f, details: f.details.startsWith('v1:') ? sealer.open(f.details) : f.details })));
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
        .map((x) => ({ ...x, details: sealer.open(x.details) })),
      negativeFeedback: db
        .prepare('SELECT * FROM feedback WHERE about_id = ? AND ok = 0 ORDER BY created_at DESC')
        .all(user.id)
        .map((x) => ({ ...x, details: sealer.open(x.details) })),
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
    res.json(rows.map((m) => ({ id: m.id, senderId: m.sender_id, text: sealer.open(m.body), imageId: m.image_id, createdAt: m.created_at })));
  });

  const setStatus = (status) => (req, res) => {
    const user = getUser(db, userId(req));
    if (!user) throw new HttpError(404, 'users.notFound');
    const reason = str(req.body?.reason, 'fields.reason', { max: 500, optional: true });
    db.prepare('UPDATE users SET status = ?, status_reason = ? WHERE id = ?').run(status, reason, user.id);
    if (status === 'banned') {
      const ban = db.prepare('INSERT OR IGNORE INTO banned_identities (hash, reason, created_at) VALUES (?, ?, ?)');
      for (const hash of [user.person_hash, user.document_hash].filter(Boolean)) ban.run(hash, reason, nowIso());
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
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
    res.json(rows.map((w) => ({ ...w, email: sealer.open(w.email) })));
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
