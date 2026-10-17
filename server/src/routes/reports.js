import { Router } from 'express';
import { FEEDBACK_REASONS, REPORT_REASONS } from '../../../shared/constants.js';
import { addFlag, checkPattern, getMatchFor, getUser, preserveAgreement, suspendUser } from '../model.js';
import { HttpError, bool, int, nowIso, oneOf, str } from '../util.js';
import { requireAuth, requireVerified } from './auth.js';

// Pravidla automatického pozastavení (do ruční kontroly moderátorem):
//  - nahlášení nezletilé osoby, násilí nebo porušení souhlasu → okamžitě
//  - negativní hodnocení po schůzce kvůli souhlasu nebo bezpečí → okamžitě
//  - ostatní nahlášení od 3 různých lidí / jiná negativní hodnocení od 2 různých lidí → pozastavit
// Nahlásit i hodnotit může jen ověřený člověk, který s dotyčným měl match – zneužití je tím omezené.
const SEVERE_REPORTS = new Set(['minor', 'violence', 'consent']);
const SEVERE_FEEDBACK = new Set(['consent', 'safety']);
const REPORTS_TO_SUSPEND = 3;
const FEEDBACK_TO_SUSPEND = 2;

const FEEDBACK_AFTER_MS = 2 * 3600_000;
const FEEDBACK_WINDOW_MS = 14 * 86400_000;

export function reportRoutes({ db, sealer }) {
  const r = Router();
  const auth = requireAuth(db, { allowSuspended: true });

  function blockAndUnmatch(blockerId, blockedId) {
    db.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)').run(
      blockerId,
      blockedId,
      nowIso(),
    );
    const [a, b] = [blockerId, blockedId].sort((x, y) => x - y);
    db.prepare('UPDATE matches SET ended_at = COALESCE(ended_at, ?) WHERE user_a = ? AND user_b = ?').run(nowIso(), a, b);
  }

  const targetOf = (req) => {
    const id = int(req.params.id, 'fields.user', { min: 1, max: Number.MAX_SAFE_INTEGER });
    if (id === req.user.id || !getUser(db, id)) throw new HttpError(404, 'users.notFound');
    return id;
  };

  r.post('/users/:id/block', auth, (req, res) => {
    blockAndUnmatch(req.user.id, targetOf(req));
    res.status(204).end();
  });

  // Nahlášení zároveň zablokuje – nahlášeného už nikdy neuvidíš.
  r.post('/users/:id/report', auth, (req, res) => {
    const targetId = targetOf(req);
    const reason = oneOf(req.body?.reason, 'fields.reason', REPORT_REASONS);
    const details = str(req.body?.details, 'fields.details', { max: 2000, optional: true });
    const [a, b] = [req.user.id, targetId].sort((x, y) => x - y);
    const match = db.prepare('SELECT id FROM matches WHERE user_a = ? AND user_b = ?').get(a, b);

    const { lastInsertRowid } = db
      .prepare('INSERT INTO reports (reporter_id, reported_id, match_id, reason, details, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.user.id, targetId, match?.id ?? null, reason, sealer.seal(details), nowIso());
    addFlag(db, {
      userId: targetId,
      byUserId: req.user.id,
      source: 'report',
      reason,
      priority: SEVERE_REPORTS.has(reason) ? 'high' : 'normal',
      refId: Number(lastInsertRowid),
    });
    // Nahlášení zachová domluvy a schůzky s tímhle člověkem pro moderátory (a případně policii).
    if (match) {
      for (const a of db.prepare('SELECT id FROM agreements WHERE match_id = ?').all(match.id)) preserveAgreement(db, a.id);
    }

    const reporters = db
      .prepare('SELECT COUNT(DISTINCT reporter_id) AS n FROM reports WHERE reported_id = ?')
      .get(targetId).n;
    if (SEVERE_REPORTS.has(reason)) suspendUser(db, targetId, `Nahlášení: ${REPORT_REASONS[reason]}`);
    else if (reporters >= REPORTS_TO_SUSPEND) suspendUser(db, targetId, 'Opakovaná nahlášení');
    checkPattern(db, targetId);

    blockAndUnmatch(req.user.id, targetId);
    res.status(201).json({ ok: true });
  });

  // --- hodnocení po schůzce (protějšek ho nikdy nevidí) ---

  r.get('/feedback/pending', requireAuth(db), requireVerified, (req, res) => {
    const now = Date.now();
    const rows = db
      .prepare(
        `SELECT a.id, a.meet_at, m.id AS match_id, u.name AS partner_name
         FROM agreements a
         JOIN matches m ON m.id = a.match_id
         JOIN users u ON u.id = CASE WHEN m.user_a = ? THEN m.user_b ELSE m.user_a END
         WHERE (m.user_a = ? OR m.user_b = ?) AND a.was_confirmed = 1
           AND NOT EXISTS (SELECT 1 FROM feedback f WHERE f.agreement_id = a.id AND f.author_id = ?)`,
      )
      .all(req.user.id, req.user.id, req.user.id, req.user.id)
      .filter((row) => {
        const t = Date.parse(row.meet_at);
        return now - t > FEEDBACK_AFTER_MS && now - t < FEEDBACK_WINDOW_MS;
      });
    res.json(rows.map((row) => ({ agreementId: row.id, matchId: row.match_id, partnerName: row.partner_name, meetAt: row.meet_at })));
  });

  r.post('/feedback/:agreementId', auth, (req, res) => {
    const agreement = db.prepare('SELECT * FROM agreements WHERE id = ?').get(Number(req.params.agreementId));
    if (!agreement || !agreement.was_confirmed) throw new HttpError(404, 'agreement.notFound');
    const { otherId } = getMatchFor(db, agreement.match_id, req.user.id, { allowEnded: true });
    const ok = bool(req.body?.ok);
    const reason = ok ? '' : oneOf(req.body?.reason, 'fields.reason', FEEDBACK_REASONS);
    const details = str(req.body?.details, 'fields.details', { max: 2000, optional: true });

    const inserted = db
      .prepare(
        'INSERT OR IGNORE INTO feedback (agreement_id, author_id, about_id, ok, reason, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(agreement.id, req.user.id, otherId, ok ? 1 : 0, reason, sealer.seal(details), nowIso());
    if (inserted.changes === 0) throw new HttpError(409, 'reports.feedbackSent');

    if (!ok) {
      // Ve výchozím stavu se záznam uchová – rozhoduje ten, kdo hlásí problém.
      if (req.body?.preserve !== false) preserveAgreement(db, agreement.id);
      addFlag(db, {
        userId: otherId,
        byUserId: req.user.id,
        source: 'feedback',
        reason,
        priority: SEVERE_FEEDBACK.has(reason) ? 'high' : 'normal',
        refId: agreement.id,
      });
      const negatives = db
        .prepare('SELECT COUNT(DISTINCT author_id) AS n FROM feedback WHERE about_id = ? AND ok = 0')
        .get(otherId).n;
      if (SEVERE_FEEDBACK.has(reason)) suspendUser(db, otherId, `Hodnocení po schůzce: ${FEEDBACK_REASONS[reason]}`);
      else if (negatives >= FEEDBACK_TO_SUSPEND) suspendUser(db, otherId, 'Opakovaná negativní hodnocení');
      checkPattern(db, otherId);
    }
    res.status(201).json({ ok: true });
  });

  return r;
}
