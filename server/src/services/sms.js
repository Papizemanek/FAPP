// Odesílání SMS důvěryhodné osobě. Je to bezpečnostně kritické, proto zprávy jdou přes
// frontu (sms_outbox) a hlídač je opakovaně zkouší odeslat, dokud neprojdou.

export function createSms(config) {
  if (config.smsProvider === 'twilio') return twilioSms(config.twilio);
  if (config.smsProvider === 'memory') return memorySms();
  return consoleSms();
}

export function memorySms() {
  const sent = [];
  return { name: 'memory', sent, async send(to, body) { sent.push({ to, body }); } };
}

function consoleSms() {
  return {
    name: 'console',
    async send(to, body) {
      console.log(`[SMS → ${to}] ${body}`);
    },
  };
}

function twilioSms({ accountSid, authToken, from, messagingServiceSid }) {
  if (!accountSid || !authToken || !(from || messagingServiceSid)) {
    throw new Error('Twilio: chybí TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN a TWILIO_FROM / TWILIO_MESSAGING_SERVICE_SID.');
  }
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  return {
    name: 'twilio',
    async send(to, body) {
      const params = new URLSearchParams({ To: to, Body: body });
      if (messagingServiceSid) params.set('MessagingServiceSid', messagingServiceSid);
      else params.set('From', from);
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      });
      if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text()}`);
    },
  };
}
