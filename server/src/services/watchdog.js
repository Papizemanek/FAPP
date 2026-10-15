import { AGREEMENT_RETENTION_HOURS } from '../../../shared/constants.js';
import { applyDeferredSuspensions } from '../model.js';
import { checkOverdue } from '../routes/safety.js';

const DAY = 86400_000;

/** Jedno kolo hlídače: zmeškané check-iny → SMS, pak odeslání fronty SMS (včetně opakování). */
export async function runWatchdog(ctx, now = Date.now()) {
  checkOverdue(ctx, now);
  applyDeferredSuspensions(ctx.db);
  await ctx.alerts.flush();
}

/**
 * Mazání starých dat (minimalizace podle GDPR):
 *  - obsah domluvy (přání, místo, stopslovo, potvrzení) 48 h po schůzce nebo zrušení – pokud ho nikdo
 *    z dvojice nechtěl uchovat; zůstane jen kostra pro hodnocení po schůzce
 *  - ukončené bezpečnostní režimy po 7 dnech (odkaz pro důvěryhodnou osobu přestane existovat)
 *  - zprávy a fotky ukončených matchů po 30 dnech, pokud konverzace nebyla nahlášená
 *  - odeslané SMS po 30 dnech, záznamy o ověření po 90 dnech
 */
export function purgeOldData(db, now = Date.now()) {
  const before = (days) => new Date(now - days * DAY).toISOString();
  const cutoff = new Date(now - AGREEMENT_RETENTION_HOURS * 3600_000).toISOString();
  const toRedact = db
    .prepare(
      `SELECT id FROM agreements WHERE redacted_at IS NULL AND preserved_at IS NULL
         AND (meet_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?))`,
    )
    .all(cutoff, cutoff);
  for (const { id } of toRedact) {
    db.prepare('DELETE FROM agreement_wishes WHERE agreement_id = ?').run(id);
    db.prepare('DELETE FROM agreement_confirmations WHERE agreement_id = ?').run(id);
    db.prepare(
      "UPDATE agreements SET place = '', safeword = '', note = '', activities = '[]', ever_confirmed_at = NULL, redacted_at = ? WHERE id = ?",
    ).run(new Date(now).toISOString(), id);
  }
  db.prepare('DELETE FROM safety_sessions WHERE ended_at IS NOT NULL AND ended_at < ? AND preserved = 0').run(before(7));
  const reported = `SELECT match_id FROM reports WHERE match_id IS NOT NULL
                    UNION SELECT ref_id FROM flags WHERE source = 'chat' AND ref_id IS NOT NULL`;
  const oldMatches = `SELECT id FROM matches WHERE ended_at IS NOT NULL AND ended_at < ? AND id NOT IN (${reported})`;
  db.prepare(`DELETE FROM messages WHERE match_id IN (${oldMatches})`).run(before(30));
  db.prepare(`DELETE FROM images WHERE kind = 'chat' AND match_id IN (${oldMatches})`).run(before(30));
  db.prepare('DELETE FROM sms_outbox WHERE sent_at IS NOT NULL AND sent_at < ?').run(before(30));
  db.prepare('DELETE FROM verification_sessions WHERE created_at < ?').run(before(90));
}

export function startWatchdog(ctx, { intervalMs = 30_000 } = {}) {
  const tick = () => runWatchdog(ctx).catch((err) => console.error('[watchdog]', err));
  const purge = () => {
    try {
      purgeOldData(ctx.db);
    } catch (err) {
      console.error('[purge]', err);
    }
  };
  tick();
  purge();
  const t1 = setInterval(tick, intervalMs);
  const t2 = setInterval(purge, 3600_000);
  return () => {
    clearInterval(t1);
    clearInterval(t2);
  };
}
