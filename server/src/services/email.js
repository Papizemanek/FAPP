// E-maily pro bezpečnost účtu: kódy k registraci a obnově hesla, upozornění na přihlášení a změny.
// Texty jsou záměrně neutrální (bez zmínky o seznamování) – e-mail může vidět i někdo jiný.

export function createEmail(config) {
  if (config.emailProvider === 'resend') return resendEmail(config.resend);
  if (config.emailProvider === 'memory') return memoryEmail();
  return consoleEmail();
}

export function memoryEmail() {
  const sent = [];
  return { name: 'memory', sent, async send(to, subject, text) { sent.push({ to, subject, text }); } };
}

function consoleEmail() {
  return {
    name: 'console',
    async send(to, subject, text) {
      console.log(`[E-mail → ${to}] ${subject}\n${text}`);
    },
  };
}

function resendEmail({ apiKey, from }) {
  if (!apiKey || !from) throw new Error('Resend: chybí RESEND_API_KEY nebo EMAIL_FROM.');
  return {
    name: 'resend',
    async send(to, subject, text) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, text }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    },
  };
}
