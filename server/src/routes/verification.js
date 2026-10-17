import { Router } from 'express';
import { MIN_AGE } from '../../../shared/constants.js';
import { identityHash } from '../crypto.js';
import { DEFAULT_LOCALE, tr } from '../i18n.js';
import { getUser } from '../model.js';
import { HttpError, ageFrom, nowIso } from '../util.js';
import { requireAuth } from './auth.js';

// Důvody zamítnutí s vlastním vysvětlením (verification.declined.<důvod>), ostatní mají obecné.
const DECLINE_REASONS = new Set(['underage', 'banned', 'duplicate', 'incomplete']);

export function verificationStatusView(user, lastSession, locale = DEFAULT_LOCALE) {
  if (user.verification_status !== 'declined') return { status: user.verification_status, message: '' };
  const reason = DECLINE_REASONS.has(lastSession?.reason) ? lastSession.reason : 'default';
  return { status: user.verification_status, message: tr(locale, `verification.declined.${reason}`) };
}

/**
 * Zpracuje rozhodnutí poskytovatele. Kontroluje věk, ban na osobu a pravidlo „jeden člověk = jeden účet“.
 * Doklad ani jméno z dokladu se neukládají – jen HMAC otisky a datum narození.
 */
export function applyDecision(db, config, decision) {
  const session = db.prepare('SELECT * FROM verification_sessions WHERE provider_id = ?').get(decision.providerId);
  if (!session) throw new HttpError(404, 'verification.unknown');
  const user = getUser(db, session.user_id);
  if (!user) return;

  const finish = (sessionStatus, reason, userStatus) => {
    db.prepare('UPDATE verification_sessions SET status = ?, reason = ?, decided_at = ? WHERE id = ?').run(
      sessionStatus,
      reason,
      nowIso(),
      session.id,
    );
    db.prepare('UPDATE users SET verification_status = ? WHERE id = ?').run(userStatus, user.id);
  };

  if (!decision.approved) {
    if (decision.final) finish('declined', decision.reason || 'declined', 'declined');
    else finish('resubmit', decision.reason || 'resubmit', 'pending');
    return;
  }

  const { firstName, lastName, dateOfBirth } = decision.person;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth ?? '')) return finish('declined', 'incomplete', 'declined');

  if (ageFrom(dateOfBirth) < MIN_AGE) {
    finish('declined', 'underage', 'declined');
    db.prepare("UPDATE users SET status = 'suspended', status_reason = 'Nezletilá osoba' WHERE id = ?").run(user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    return;
  }

  const personHash = identityHash(config.identitySecret, 'person', firstName, lastName, dateOfBirth);
  const documentHash = decision.document.number
    ? identityHash(config.identitySecret, 'document', decision.document.country, decision.document.number)
    : null;

  const banned = db
    .prepare('SELECT 1 FROM banned_identities WHERE hash IN (?, ?)')
    .get(personHash, documentHash ?? personHash);
  if (banned) {
    finish('declined', 'banned', 'declined');
    db.prepare("UPDATE users SET status = 'banned', status_reason = 'Dříve zablokovaná osoba' WHERE id = ?").run(user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    return;
  }

  const duplicate = db.prepare('SELECT 1 FROM users WHERE person_hash = ? AND id != ?').get(personHash, user.id);
  if (duplicate) return finish('declined', 'duplicate', 'declined');

  finish('approved', '', 'approved');
  db.prepare('UPDATE users SET verified_at = ?, person_hash = ?, document_hash = ?, birthdate = ? WHERE id = ?').run(
    nowIso(),
    personHash,
    documentHash,
    dateOfBirth,
    user.id,
  );
}

export function verificationRoutes({ db, config, services }) {
  const r = Router();
  const provider = services.verification;
  const lastSession = (userId) =>
    db.prepare('SELECT * FROM verification_sessions WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId);

  r.get('/', requireAuth(db), (req, res) => {
    res.json(verificationStatusView(req.user, lastSession(req.user.id), req.locale));
  });

  r.post('/start', requireAuth(db), async (req, res) => {
    if (req.user.verification_status === 'approved') throw new HttpError(409, 'verification.alreadyVerified');
    const { providerId, url } = await provider.start({
      userId: req.user.id,
      callbackUrl: `${config.publicUrl}/verification/done`,
    });
    db.prepare('INSERT INTO verification_sessions (user_id, provider, provider_id, created_at) VALUES (?, ?, ?, ?)').run(
      req.user.id,
      provider.name,
      providerId,
      nowIso(),
    );
    db.prepare("UPDATE users SET verification_status = 'pending' WHERE id = ?").run(req.user.id);
    res.status(201).json({ provider: provider.name, url });
  });

  // Webhook poskytovatele – ověřuje se podpisem, ne přihlášením.
  r.post('/webhook', (req, res) => {
    const decision = provider.parseWebhook(req.rawBody ?? Buffer.alloc(0), req.headers);
    applyDecision(db, config, decision);
    res.status(204).end();
  });

  // Jen pro vývoj: simuluje rozhodnutí poskytovatele.
  r.post('/dev-decide', requireAuth(db), (req, res) => {
    if (provider.name !== 'dev') throw new HttpError(404, 'errors.notFound');
    const session = lastSession(req.user.id);
    if (!session) throw new HttpError(400, 'verification.startFirst');
    const b = req.body ?? {};
    applyDecision(db, config, {
      providerId: session.provider_id,
      approved: b.approved !== false,
      final: true,
      reason: b.approved === false ? 'declined' : '',
      person: { firstName: b.firstName ?? req.user.name, lastName: b.lastName ?? 'Test', dateOfBirth: b.dateOfBirth ?? req.user.birthdate },
      document: { country: 'CZ', number: b.documentNumber ?? '' },
    });
    const user = getUser(db, req.user.id);
    res.json(verificationStatusView(user, lastSession(user.id), req.locale));
  });

  return r;
}
