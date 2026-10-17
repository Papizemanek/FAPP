import { Router } from 'express';
import { ACTIVITIES, CONSENT_TEXT_VERSION, REVOKE_COOLDOWN_DAYS, WISHES } from '../../../shared/constants.js';
import {
  addFlag,
  agreementStatus,
  agreementView,
  checkPattern,
  currentAgreement,
  getMatchFor,
  isFullyConfirmed,
  requireActivePartner,
} from '../model.js';
import { msg } from '../i18n.js';
import { notify } from '../services/push.js';
import { HttpError, bool, dateTime, int, nowIso, str } from '../util.js';
import { requireAuth, requireVerified } from './auth.js';

const MAX_DAYS_AHEAD = 30;

// Domluva: každý uloží svá přání (naslepo) a oba potvrdí stejné praktické věci.
// Potvrzuje se záměr a poučení, že domluva není souhlas – ne souhlas sám.

function parseWishes(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'agreement.wishesRequired');
  const wishes = {};
  for (const key of Object.keys(ACTIVITIES)) {
    const v = value[key] ?? 'no';
    if (!Object.hasOwn(WISHES, v)) throw new HttpError(400, 'agreement.invalidWish');
    wishes[key] = v;
  }
  return wishes;
}

export function agreementRoutes({ db, services, sealer }) {
  const r = Router();

  const loadForUser = (agreementId, userId) => {
    const agreement = db.prepare('SELECT * FROM agreements WHERE id = ?').get(Number(agreementId));
    if (!agreement) throw new HttpError(404, 'agreement.notFound');
    const { match, other } = getMatchFor(db, agreement.match_id, userId, { allowEnded: true });
    return { agreement, match, other };
  };

  r.post('/matches/:id/agreement', requireAuth(db), requireVerified, (req, res) => {
    const { match, other } = getMatchFor(db, req.params.id, req.user.id);
    requireActivePartner(other);
    const b = req.body ?? {};
    if (!bool(b.intent) || !bool(b.notice)) {
      throw new HttpError(400, 'agreement.confirmBoth');
    }

    const meetAt = dateTime(b.meetAt, 'fields.meetAt');
    const t = Date.parse(meetAt);
    if (t < Date.now() - 3600_000 || t > Date.now() + MAX_DAYS_AHEAD * 86400_000) {
      throw new HttpError(400, 'agreement.meetWithin', { params: { count: MAX_DAYS_AHEAD } });
    }
    const logistics = {
      meet_at: meetAt,
      place: str(b.place, 'fields.place', { min: 2, max: 120 }),
      condom: bool(b.condom) ? 1 : 0,
      sober: bool(b.sober) ? 1 : 0,
      public_first: bool(b.publicFirst) ? 1 : 0,
      safeword: str(b.safeword, 'fields.safeword', { min: 2, max: 40 }),
    };
    const wishes = parseWishes(b.wishes);
    const note = str(b.note, 'fields.note', { max: 500, optional: true });

    const current = currentAgreement(db, match.id);
    const editable = current && ['pending', 'confirmed'].includes(agreementStatus(db, current, match));

    // Kdo byl odmítnut, nemůže hned tlačit novou domluvou. Znovu ji může otevřít jen ten, kdo zrušil.
    if (!editable && current?.revoked_at && current.revoked_by !== req.user.id) {
      const until = Date.parse(current.revoked_at) + REVOKE_COOLDOWN_DAYS * 86400_000;
      if (Date.now() < until) throw new HttpError(403, 'agreement.cooldown', { params: { name: other.name } });
    }

    const now = nowIso();
    let agreement;
    let logisticsChanged = false;
    if (editable) {
      if (b.baseVersion !== undefined && int(b.baseVersion, 'fields.version', { min: 1, max: 100000 }) !== current.version) {
        throw new HttpError(409, 'agreement.changed');
      }
      logisticsChanged =
        current.meet_at !== logistics.meet_at ||
        current.place !== logistics.place ||
        current.condom !== logistics.condom ||
        current.sober !== logistics.sober ||
        current.public_first !== logistics.public_first ||
        sealer.open(current.safeword) !== logistics.safeword;
      if (logisticsChanged) {
        db.prepare(
          `UPDATE agreements SET meet_at = ?, place = ?, condom = ?, sober = ?, public_first = ?, safeword = ?,
             version = version + 1, proposed_by = ?, updated_at = ? WHERE id = ?`,
        ).run(
          logistics.meet_at,
          logistics.place,
          logistics.condom,
          logistics.sober,
          logistics.public_first,
          sealer.seal(logistics.safeword),
          req.user.id,
          now,
          current.id,
        );
        db.prepare('DELETE FROM agreement_confirmations WHERE agreement_id = ?').run(current.id);
      }
      agreement = db.prepare('SELECT * FROM agreements WHERE id = ?').get(current.id);
    } else {
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO agreements (match_id, proposed_by, meet_at, place, activities, condom, sober, public_first, safeword, created_at, updated_at)
           VALUES (?, ?, ?, ?, '[]', ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          match.id,
          req.user.id,
          logistics.meet_at,
          logistics.place,
          logistics.condom,
          logistics.sober,
          logistics.public_first,
          sealer.seal(logistics.safeword),
          now,
          now,
        );
      agreement = db.prepare('SELECT * FROM agreements WHERE id = ?').get(lastInsertRowid);
    }

    db.prepare(
      `INSERT OR REPLACE INTO agreement_wishes (agreement_id, user_id, wishes, note, updated_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(agreement.id, req.user.id, sealer.seal(JSON.stringify(wishes)), sealer.seal(note), now);
    db.prepare(
      `INSERT OR REPLACE INTO agreement_confirmations (agreement_id, user_id, version, consent_text_version, confirmed_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(agreement.id, req.user.id, agreement.version, CONSENT_TEXT_VERSION, now);

    const complete = isFullyConfirmed(db, agreement, match);
    if (complete) db.prepare('UPDATE agreements SET was_confirmed = 1 WHERE id = ?').run(agreement.id);

    const kind = complete ? 'agreementComplete' : !editable ? 'agreementNew' : logisticsChanged ? 'agreementChanged' : 'agreementUpdated';
    notify(db, services.push, other.id, {
      title: msg(`push.${kind}.title`),
      body: msg(`push.${kind}.body`, { name: req.user.name }),
      data: { type: 'agreement', matchId: match.id },
    });
    res.status(editable ? 200 : 201).json(agreementView(db, agreement, match, req.user.id, sealer.open));
  });

  // Zrušení domluvy – kdykoli, bez udání důvodu, i z pozastaveného účtu. Bezpečnostní režim tím NEKONČÍ.
  r.post('/agreements/:id/revoke', requireAuth(db, { allowSuspended: true }), (req, res) => {
    const { agreement, match, other } = loadForUser(req.params.id, req.user.id);
    if (!agreement.revoked_at) {
      db.prepare('UPDATE agreements SET revoked_at = ?, revoked_by = ? WHERE id = ?').run(nowIso(), req.user.id, agreement.id);
      // Zrušení během schůzky je signál pro moderátory (samo o sobě nic neznamená, opakování u víc lidí ano).
      const duringMeetup = db
        .prepare('SELECT 1 FROM safety_sessions WHERE match_id = ? AND ended_at IS NULL')
        .get(match.id);
      if (duringMeetup) {
        addFlag(db, { userId: other.id, byUserId: req.user.id, source: 'revocation', reason: 'revoked_during_meetup', refId: agreement.id });
        checkPattern(db, other.id);
      }
      notify(db, services.push, other.id, {
        title: msg('push.agreementRevoked.title'),
        body: msg('push.agreementRevoked.body', { name: req.user.name }),
        data: { type: 'agreement', matchId: match.id },
      });
    }
    const fresh = db.prepare('SELECT * FROM agreements WHERE id = ?').get(agreement.id);
    res.json(agreementView(db, fresh, match, req.user.id, sealer.open));
  });

  return r;
}
