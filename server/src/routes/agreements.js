import { Router } from 'express';
import { ACTIVITIES, CONSENT_TEXT_VERSION } from '../../../shared/constants.js';
import {
  agreementStatus,
  agreementView,
  currentAgreement,
  getMatchFor,
  isFullyConfirmed,
  requireActivePartner,
} from '../model.js';
import { notify } from '../services/push.js';
import { HttpError, bool, dateTime, int, listOf, nowIso, str } from '../util.js';
import { requireAuth, requireVerified } from './auth.js';

const MAX_DAYS_AHEAD = 30;

export function agreementRoutes({ db, services, sealer }) {
  const r = Router();

  const requireConsent = (body) => {
    if (!bool(body?.consent)) throw new HttpError(400, 'Dohodu musíš výslovně potvrdit.');
  };

  const loadForUser = (agreementId, userId) => {
    const agreement = db.prepare('SELECT * FROM agreements WHERE id = ?').get(Number(agreementId));
    if (!agreement) throw new HttpError(404, 'Dohoda neexistuje.');
    const { match, other } = getMatchFor(db, agreement.match_id, userId, { allowEnded: true });
    return { agreement, match, other };
  };

  const confirm = (agreement, userId) =>
    db
      .prepare(
        `INSERT OR REPLACE INTO agreement_confirmations (agreement_id, user_id, version, consent_text_version, confirmed_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(agreement.id, userId, agreement.version, CONSENT_TEXT_VERSION, nowIso());

  // Návrh nebo úprava dohody. Každá změna = nová verze a oba musí znovu potvrdit.
  r.post('/matches/:id/agreement', requireAuth(db), requireVerified, (req, res) => {
    const { match, other } = getMatchFor(db, req.params.id, req.user.id);
    requireActivePartner(other);
    const b = req.body ?? {};
    requireConsent(b);

    const meetAt = dateTime(b.meetAt, 'kdy');
    const t = Date.parse(meetAt);
    if (t < Date.now() - 3600_000 || t > Date.now() + MAX_DAYS_AHEAD * 86400_000) {
      throw new HttpError(400, `Schůzka musí být v příštích ${MAX_DAYS_AHEAD} dnech.`);
    }
    const fields = {
      meet_at: meetAt,
      place: str(b.place, 'kde', { min: 2, max: 120 }),
      activities: JSON.stringify(listOf(b.activities, 'co ano', ACTIVITIES, { min: 1 })),
      note: sealer.seal(str(b.note, 'upřesnění', { max: 500, optional: true })),
      condom: bool(b.condom) ? 1 : 0,
      sober: bool(b.sober) ? 1 : 0,
      safeword: sealer.seal(str(b.safeword, 'stopslovo', { min: 2, max: 40 })),
    };

    const current = currentAgreement(db, match.id);
    const editable = current && ['pending', 'confirmed'].includes(agreementStatus(db, current, match));
    let agreementId;
    if (editable) {
      db.prepare(
        `UPDATE agreements SET meet_at = ?, place = ?, activities = ?, note = ?, condom = ?, sober = ?, safeword = ?,
           version = version + 1, proposed_by = ?, updated_at = ? WHERE id = ?`,
      ).run(...Object.values(fields), req.user.id, nowIso(), current.id);
      db.prepare('DELETE FROM agreement_confirmations WHERE agreement_id = ?').run(current.id);
      agreementId = current.id;
    } else {
      const now = nowIso();
      agreementId = Number(
        db
          .prepare(
            `INSERT INTO agreements (match_id, proposed_by, meet_at, place, activities, note, condom, sober, safeword, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(match.id, req.user.id, ...Object.values(fields), now, now).lastInsertRowid,
      );
    }
    const agreement = db.prepare('SELECT * FROM agreements WHERE id = ?').get(agreementId);
    confirm(agreement, req.user.id);

    notify(db, services.push, other.id, {
      title: editable ? 'Dohoda se změnila' : 'Nový návrh dohody',
      body: `${req.user.name} ${editable ? 'upravil/a dohodu. Potvrď ji znovu.' : 'navrhl/a dohodu. Podívej se na ni.'}`,
      data: { type: 'agreement', matchId: match.id },
    });
    res.status(editable ? 200 : 201).json(agreementView(db, agreement, match, req.user.id, sealer.open));
  });

  r.post('/agreements/:id/confirm', requireAuth(db), requireVerified, (req, res) => {
    const { agreement, match, other } = loadForUser(req.params.id, req.user.id);
    if (match.ended_at) throw new HttpError(410, 'Tenhle match už skončil.');
    requireActivePartner(other);
    requireConsent(req.body);
    const version = int(req.body?.version, 'verze', { min: 1, max: 100000 });
    if (version !== agreement.version) {
      throw new HttpError(409, 'Dohoda se mezitím změnila. Přečti si ji znovu.');
    }
    const status = agreementStatus(db, agreement, match);
    if (!['pending', 'confirmed'].includes(status)) throw new HttpError(409, 'Tuhle dohodu už nejde potvrdit.');
    confirm(agreement, req.user.id);

    if (isFullyConfirmed(db, agreement, match)) {
      db.prepare('UPDATE agreements SET ever_confirmed_at = COALESCE(ever_confirmed_at, ?) WHERE id = ?').run(
        nowIso(),
        agreement.id,
      );
      notify(db, services.push, other.id, {
        title: 'Dohoda platí',
        body: `${req.user.name} potvrdil/a dohodu. Platí jen to, na čem jste se domluvili.`,
        data: { type: 'agreement', matchId: match.id },
      });
    }
    res.json(agreementView(db, agreement, match, req.user.id, sealer.open));
  });

  // Odvolání souhlasu – kdykoli, bez udání důvodu, i z pozastaveného účtu.
  // Bezpečnostní režim tím NEKONČÍ.
  r.post('/agreements/:id/revoke', requireAuth(db, { allowSuspended: true }), (req, res) => {
    const { agreement, match, other } = loadForUser(req.params.id, req.user.id);
    if (!agreement.revoked_at) {
      db.prepare('UPDATE agreements SET revoked_at = ?, revoked_by = ? WHERE id = ?').run(
        nowIso(),
        req.user.id,
        agreement.id,
      );
      notify(db, services.push, other.id, {
        title: 'Souhlas odvolán',
        body: `${req.user.name} odvolal/a souhlas. Schůzka se nekoná – a to je potřeba respektovat.`,
        data: { type: 'agreement', matchId: match.id },
      });
    }
    const fresh = db.prepare('SELECT * FROM agreements WHERE id = ?').get(agreement.id);
    res.json(agreementView(db, fresh, match, req.user.id, sealer.open));
  });

  return r;
}
