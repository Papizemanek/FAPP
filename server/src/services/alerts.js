import { nowIso } from '../util.js';

// SMS pro důvěryhodnou osobu. Texty jsou krátké, bez slova „sex“ a bez detailů dohody –
// SMS může vidět kdokoli, kdo má v ruce telefon důvěryhodné osoby.

const time = (iso) =>
  new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );

export const smsText = {
  started: (name, url) =>
    `${name} má schůzku a vybral/a si tě jako důvěryhodnou osobu. Tady uvidíš, kde je a jestli je v pořádku: ${url}`,
  alarm: (name, url) => `POPLACH: ${name} potřebuje pomoc. Poloha a podrobnosti: ${url}`,
  overdue: (name, dueIso, url) =>
    `${name} se neozval/a – potvrzení, že je v pořádku, mělo přijít do ${time(dueIso)}. Zkus zavolat. Poloha: ${url}`,
  backOk: (name) => `${name} se ozval/a a potvrdil/a, že je v pořádku.`,
  sosCancelled: (name) => `${name} zrušil/a poplach – byl to omyl, je v pořádku.`,
  endedOk: (name) => `${name} ukončil/a schůzku a je v pořádku. Díky, že jsi byl/a k dispozici.`,
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
