import { Router } from 'express';
import { saveImage } from '../images.js';
import {
  activeSafetySession,
  addFlag,
  agreementStatus,
  agreementView,
  currentAgreement,
  getMatchFor,
  ownSafetyView,
  partnerSafetyView,
  publicProfile,
  requireActivePartner,
} from '../model.js';
import { moderate } from '../services/moderation.js';
import { notify } from '../services/push.js';
import { HttpError, int, nowIso, str } from '../util.js';
import { requireAuth, requireVerified } from './auth.js';

export function matchRoutes({ db, config, services, sealer, limiter }) {
  const r = Router();
  r.use(requireAuth(db), requireVerified);

  const messageView = (m, viewerId) => ({
    id: m.id,
    mine: m.sender_id === viewerId,
    text: sealer.open(m.body),
    imageUrl: m.image_id ? `/api/images/${m.image_id}` : null,
    // Bezpečnostní upozornění vidí jen příjemce zprávy.
    warning: m.sender_id === viewerId ? '' : m.warning,
    createdAt: m.created_at,
  });

  r.get('/', (req, res) => {
    const rows = db
      .prepare(
        `SELECT u.*, m.id AS match_id, m.user_a AS m_user_a, m.user_b AS m_user_b, m.created_at AS matched_at
         FROM matches m
         JOIN users u ON u.id = CASE WHEN m.user_a = ? THEN m.user_b ELSE m.user_a END
         WHERE (m.user_a = ? OR m.user_b = ?) AND m.ended_at IS NULL AND u.status = 'active'
         ORDER BY m.id DESC`,
      )
      .all(req.user.id, req.user.id, req.user.id);
    const lastMessage = db.prepare('SELECT * FROM messages WHERE match_id = ? ORDER BY id DESC LIMIT 1');
    res.json(
      rows.map((row) => {
        const match = { id: row.match_id, user_a: row.m_user_a, user_b: row.m_user_b };
        const last = lastMessage.get(row.match_id);
        const agreement = currentAgreement(db, row.match_id);
        return {
          id: row.match_id,
          matchedAt: row.matched_at,
          partner: publicProfile(row, req.user),
          lastMessage: last
            ? { text: last.image_id && !last.body ? 'Fotka' : sealer.open(last.body), mine: last.sender_id === req.user.id, at: last.created_at }
            : null,
          agreementStatus: agreement ? agreementStatus(db, agreement, match) : null,
        };
      }),
    );
  });

  r.get('/:id', (req, res) => {
    const { match, other } = getMatchFor(db, req.params.id, req.user.id);
    requireActivePartner(other);
    const mine = activeSafetySession(db, req.user.id, match.id);
    const theirs = activeSafetySession(db, other.id, match.id);
    res.json({
      id: match.id,
      partner: publicProfile(other, req.user),
      agreement: agreementView(db, currentAgreement(db, match.id), match, req.user.id, sealer.open),
      safety: { mine: ownSafetyView(mine, config.publicUrl), partner: partnerSafetyView(theirs) },
    });
  });

  // Unmatch. Rozběhnutý bezpečnostní režim tím NEKONČÍ.
  r.delete('/:id', (req, res) => {
    const { match } = getMatchFor(db, req.params.id, req.user.id);
    db.prepare('UPDATE matches SET ended_at = ? WHERE id = ?').run(nowIso(), match.id);
    res.status(204).end();
  });

  r.get('/:id/messages', (req, res) => {
    const { match } = getMatchFor(db, req.params.id, req.user.id);
    const after = req.query.after ? int(req.query.after, 'after', { min: 0, max: Number.MAX_SAFE_INTEGER }) : 0;
    const rows = db
      .prepare('SELECT * FROM messages WHERE match_id = ? AND id > ? ORDER BY id ASC LIMIT 200')
      .all(match.id, after);
    res.json(rows.map((m) => messageView(m, req.user.id)));
  });

  r.post('/:id/messages', limiter('message', 30), (req, res) => {
    const { match, other } = getMatchFor(db, req.params.id, req.user.id);
    requireActivePartner(other);
    const text = str(req.body?.text, 'zpráva', { max: 2000, optional: true });
    const hasImage = typeof req.body?.jpegBase64 === 'string';
    if (!text && !hasImage) throw new HttpError(400, 'Prázdná zpráva.');

    const verdict = moderate(text);
    if (verdict.flag && verdict.action !== 'block') {
      // Doručí se (příjemce uvidí upozornění), ale moderátoři to vidí taky – např. „v appce jsi souhlasila“.
      addFlag(db, { userId: req.user.id, source: 'chat', reason: verdict.rule, priority: verdict.priority, refId: match.id, details: sealer.seal(text) });
    }
    if (verdict.action === 'block') {
      addFlag(db, {
        userId: req.user.id,
        source: 'chat',
        reason: verdict.rule,
        priority: verdict.priority,
        refId: match.id,
        details: sealer.seal(text),
      });
      throw new HttpError(422, `Zpráva nebyla odeslána. ${verdict.message}`);
    }

    const imageId = hasImage
      ? saveImage(db, { ownerId: req.user.id, kind: 'chat', matchId: match.id, base64: req.body.jpegBase64 })
      : null;
    const { lastInsertRowid } = db
      .prepare('INSERT INTO messages (match_id, sender_id, body, image_id, warning, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(match.id, req.user.id, sealer.seal(text), imageId, verdict.action === 'warn' ? verdict.message : '', nowIso());

    notify(db, services.push, other.id, {
      title: req.user.name,
      body: imageId ? 'Poslal/a fotku' : text.slice(0, 120),
      data: { type: 'message', matchId: match.id },
    });
    const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(lastInsertRowid);
    res.status(201).json(messageView(row, req.user.id));
  });

  return r;
}
