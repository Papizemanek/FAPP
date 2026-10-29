import { Router } from 'express';
import { ownProfile } from '../model.js';
import {
  checkSecondFactor,
  issueRecoveryCodes,
  newTotpSecret,
  otpauthUrl,
  revokeSessions,
  verifyTotp,
} from '../security.js';
import { HttpError, hashSecret, int, nowIso, str, verifySecret } from '../util.js';
import { requireAuth, sendSecurityEmail } from './auth.js';

// Zabezpečení účtu: přihlášená zařízení, změna hesla, dvoufázové ověření.
// Citlivé změny vyžadují heslo (a při zapnutém 2FA i kód) a pokaždé přijde upozornění e-mailem.
export function accountRoutes({ db, services, limiter }) {
  const r = Router();
  r.use(requireAuth(db, { allowSuspended: true }));
  const me = (req) => db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  const requirePassword = (req) => {
    if (!verifySecret(req.body?.password, req.user.password_hash)) throw new HttpError(403, 'profile.wrongPassword');
  };

  r.get('/sessions', (req, res) => {
    const rows = db
      .prepare('SELECT id, kind, device, created_at, last_used_at FROM auth_sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_used_at DESC')
      .all(req.user.id, nowIso());
    res.json(
      rows.map((s) => ({
        id: s.id,
        kind: s.kind,
        device: s.device,
        createdAt: s.created_at,
        lastUsedAt: s.last_used_at,
        current: s.id === req.session.id,
      })),
    );
  });

  r.delete('/sessions/:id', (req, res) => {
    const id = int(req.params.id, 'fields.session', { min: 1, max: Number.MAX_SAFE_INTEGER });
    db.prepare('DELETE FROM auth_sessions WHERE id = ? AND user_id = ?').run(id, req.user.id);
    res.status(204).end();
  });

  // „Odhlásit všude jinde“ – např. po ztrátě telefonu.
  r.post('/sessions/revoke-others', (req, res) => {
    revokeSessions(db, req.user.id, { except: req.session.id });
    res.status(204).end();
  });

  r.put('/password', limiter('password', 5), (req, res) => {
    requirePassword(req);
    const next = str(req.body?.newPassword, 'fields.newPassword', { min: 10, max: 200 });
    if (verifySecret(next, req.user.password_hash)) throw new HttpError(400, 'account.samePassword');
    db.prepare('UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?').run(hashSecret(next), nowIso(), req.user.id);
    // Kdo heslo znal, už se nepřihlásí: ostatní zařízení se odhlásí.
    revokeSessions(db, req.user.id, { except: req.session.id });
    sendSecurityEmail(services, req.user.email, req.user.locale, 'passwordChanged');
    res.status(204).end();
  });

  // Zapnutí 2FA: 1) nový klíč (po zadání hesla), 2) potvrzení kódem z aplikace → záložní kódy.
  r.post('/2fa/setup', limiter('2fa', 10), (req, res) => {
    requirePassword(req);
    if (req.user.totp_enabled) throw new HttpError(409, 'account.twoFactorOn');
    const secret = newTotpSecret();
    db.prepare('UPDATE users SET totp_secret = ?, totp_last_step = 0 WHERE id = ?').run(db.seal(secret), req.user.id);
    res.json({ secret, otpauthUrl: otpauthUrl(secret, req.user.email) });
  });

  r.post('/2fa/enable', limiter('2fa', 10), (req, res) => {
    const user = me(req);
    if (user.totp_enabled) throw new HttpError(409, 'account.twoFactorOn');
    if (!user.totp_secret) throw new HttpError(400, 'account.twoFactorSetupFirst');
    const step = verifyTotp(user.totp_secret, req.body?.code, 0);
    if (!step) throw new HttpError(400, 'auth.badCode');
    db.prepare('UPDATE users SET totp_enabled = 1, totp_last_step = ? WHERE id = ?').run(step, user.id);
    const recoveryCodes = issueRecoveryCodes(db, user.id);
    sendSecurityEmail(services, user.email, user.locale, 'twoFactorOn');
    res.json({ recoveryCodes, user: ownProfile(me(req)) });
  });

  r.post('/2fa/disable', limiter('2fa', 10), (req, res) => {
    requirePassword(req);
    const user = me(req);
    if (!user.totp_enabled) throw new HttpError(409, 'account.twoFactorOff');
    if (!checkSecondFactor(db, user, req.body?.code)) throw new HttpError(400, 'auth.badCode');
    db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_last_step = 0 WHERE id = ?').run(user.id);
    db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(user.id);
    sendSecurityEmail(services, user.email, user.locale, 'twoFactorOff');
    res.json({ user: ownProfile(me(req)) });
  });

  r.post('/2fa/recovery-codes', limiter('2fa', 5), (req, res) => {
    requirePassword(req);
    const user = me(req);
    if (!user.totp_enabled) throw new HttpError(409, 'account.twoFactorOff');
    if (!checkSecondFactor(db, user, req.body?.code)) throw new HttpError(400, 'auth.badCode');
    res.json({ recoveryCodes: issueRecoveryCodes(db, user.id) });
  });

  return r;
}
