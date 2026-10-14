import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { getUser, ownProfile } from '../model.js';
import { HttpError, int, nowIso, str } from '../util.js';

// Moderátorské API (zatím bez UI). Autorizace: Authorization: Bearer <ADMIN_TOKEN>.
// Moderátor smí číst jen konverzace, které někdo nahlásil nebo které zachytila moderace.
export function adminRoutes({ db, config, sealer }) {
  const r = Router();

  r.use((req, _res, next) => {
    const given = Buffer.from((req.get('authorization') ?? '').replace(/^Bearer /, ''));
    const expected = Buffer.from(config.adminToken);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new HttpError(401, 'Neautorizováno.');
    next();
  });

  const userId = (req) => int(req.params.id, 'uživatel', { min: 1, max: Number.MAX_SAFE_INTEGER });

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
      str(req.body?.resolution, 'řešení', { max: 500, optional: true }),
      Number(req.params.id),
    );
    res.status(204).end();
  });

  r.get('/users/:id', (req, res) => {
    const user = getUser(db, userId(req));
    if (!user) throw new HttpError(404, 'Uživatel neexistuje.');
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
    if (!reported) throw new HttpError(403, 'Konverzace nebyla nahlášena.');
    const rows = db.prepare('SELECT * FROM messages WHERE match_id = ? ORDER BY id').all(matchId);
    res.json(rows.map((m) => ({ id: m.id, senderId: m.sender_id, text: sealer.open(m.body), imageId: m.image_id, createdAt: m.created_at })));
  });

  const setStatus = (status) => (req, res) => {
    const user = getUser(db, userId(req));
    if (!user) throw new HttpError(404, 'Uživatel neexistuje.');
    const reason = str(req.body?.reason, 'důvod', { max: 500, optional: true });
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

  return r;
}
