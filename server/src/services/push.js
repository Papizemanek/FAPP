// Push notifikace přes Expo Push API. V diskrétním režimu nenesou žádný obsah.
import { render, tr } from '../i18n.js';

export function createPush(config) {
  if (config.pushProvider === 'expo') return expoPush();
  if (config.pushProvider === 'memory') return memoryPush();
  return consolePush();
}

export function memoryPush() {
  const sent = [];
  return { sent, async send(messages) { sent.push(...messages); } };
}

function consolePush() {
  return {
    async send(messages) {
      for (const m of messages) console.log(`[push → ${m.to}] ${m.title}: ${m.body}`);
    },
  };
}

function expoPush() {
  return {
    async send(messages) {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      });
      if (!res.ok) console.error(`[push] Expo ${res.status}: ${await res.text()}`);
    },
  };
}

/**
 * Pošle notifikaci na všechna zařízení uživatele. Chyby jen zaloguje – push není kritický.
 * title a body jsou msg('push.…', params) – přeloží se do jazyka příjemce – nebo hotový text (jméno, zpráva).
 */
export function notify(db, push, userId, { title, body, data = {} }) {
  const user = db.prepare('SELECT discreet, locale FROM users WHERE id = ?').get(userId);
  if (!user) return;
  const tokens = db
    .prepare('SELECT DISTINCT push_token FROM sessions WHERE user_id = ? AND push_token IS NOT NULL')
    .all(userId)
    .map((r) => r.push_token);
  if (tokens.length === 0) return;
  const discreet = !!user.discreet;
  const messages = tokens.map((to) => ({
    to,
    title: discreet ? tr(user.locale, 'push.discreet') : render(user.locale, title),
    body: discreet ? '' : render(user.locale, body),
    data,
    sound: 'default',
  }));
  Promise.resolve(push.send(messages)).catch((err) => console.error('[push]', err));
}
