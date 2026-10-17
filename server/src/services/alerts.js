import { normalizeLocale, tr } from '../i18n.js';
import { nowIso } from '../util.js';

// SMS pro důvěryhodnou osobu (texty v shared/i18n/server, „sms.*“). Texty jsou krátké, bez slova „sex“
// a bez detailů domluvy – SMS může vidět kdokoli, kdo má v ruce telefon důvěryhodné osoby.
// Jazyk = jazyk uživatele, který má bezpečnostní režim zapnutý (zafixovaný při startu schůzky).

const time = (locale, iso) => {
  const code = normalizeLocale(locale);
  return new Intl.DateTimeFormat(code === 'cs' ? 'cs-CZ' : code, {
    timeZone: 'Europe/Prague',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
};

export const smsText = {
  started: (locale, name, url) => tr(locale, 'sms.started', { name, url }),
  alarm: (locale, name, url) => tr(locale, 'sms.alarm', { name, url }),
  overdue: (locale, name, dueIso, url) => tr(locale, 'sms.overdue', { name, time: time(locale, dueIso), url }),
  backOk: (locale, name) => tr(locale, 'sms.backOk', { name }),
  sosCancelled: (locale, name) => tr(locale, 'sms.sosCancelled', { name }),
  endedOk: (locale, name) => tr(locale, 'sms.endedOk', { name }),
};

export function createAlerts({ db, sms }) {
  let flushing = null;
  let again = false;

  function enqueue(session, body) {
    db.prepare('INSERT INTO sms_outbox (safety_session_id, to_phone, body, created_at) VALUES (?, ?, ?, ?)').run(
      session.id,
      session.trusted_phone,
      body,
      nowIso(),
    );
    flushSoon();
  }

  async function flushOnce() {
    const pending = db
      .prepare('SELECT * FROM sms_outbox WHERE sent_at IS NULL AND attempts < 50 ORDER BY id ASC LIMIT 100')
      .all();
    for (const msg of pending) {
      try {
        await sms.send(msg.to_phone, msg.body);
        db.prepare('UPDATE sms_outbox SET sent_at = ?, attempts = attempts + 1 WHERE id = ?').run(nowIso(), msg.id);
      } catch (err) {
        db.prepare('UPDATE sms_outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?').run(
          String(err?.message ?? err).slice(0, 500),
          msg.id,
        );
        console.error('[sms] odeslání selhalo, zkusím znovu:', err?.message ?? err);
      }
    }
  }

  /** Odešle frontu. Souběžná volání se slijí, takže se nic nepošle dvakrát. */
  function flush() {
    if (flushing) {
      again = true;
      return flushing;
    }
    flushing = (async () => {
      do {
        again = false;
        await flushOnce();
      } while (again);
    })().finally(() => {
      flushing = null;
    });
    return flushing;
  }

  function flushSoon() {
    flush().catch((err) => console.error('[sms]', err));
  }

  return { enqueue, flush };
}
