import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError, token } from '../util.js';

// Ověření totožnosti a věku (doklad + selfie s kontrolou živosti) u externího poskytovatele.
// Doklad ani fotky si neukládáme – jen výsledek, datum narození a otisk identity.
//
// Rozhraní poskytovatele:
//   start({ userId, callbackUrl }) -> { providerId, url }
//   parseWebhook(rawBody, headers) -> { providerId, approved, reason, person, document }

export function createVerification(config) {
  if (config.verificationProvider === 'veriff') return veriff(config.veriff);
  return devVerification();
}

/** Vývojový poskytovatel: rozhodnutí se simuluje přes POST /api/verification/dev-decide. */
export function devVerification() {
  return {
    name: 'dev',
    async start() {
      return { providerId: `dev-${token(9)}`, url: null };
    },
    parseWebhook() {
      throw new HttpError(404, 'Vývojový poskytovatel nemá webhook.');
    },
  };
}

// Veriff: https://devdocs.veriff.com – před spuštěním ověřit názvy polí proti aktuální dokumentaci.
function veriff({ baseUrl, apiKey, sharedSecret }) {
  if (!apiKey || !sharedSecret) throw new Error('Veriff: chybí VERIFF_API_KEY a VERIFF_SHARED_SECRET.');
  return {
    name: 'veriff',
    async start({ userId, callbackUrl }) {
      const res = await fetch(`${baseUrl}/v1/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-AUTH-CLIENT': apiKey },
        body: JSON.stringify({ verification: { callback: callbackUrl, vendorData: String(userId) } }),
      });
      if (!res.ok) throw new HttpError(502, 'Ověřovací služba teď neodpovídá. Zkus to za chvíli.');
      const json = await res.json();
      return { providerId: json.verification.id, url: json.verification.url };
    },
    parseWebhook(rawBody, headers) {
      const signature = String(headers['x-hmac-signature'] ?? '');
      const expected = createHmac('sha256', sharedSecret).update(rawBody).digest('hex');
      const valid =
        signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
      if (!valid) throw new HttpError(401, 'Neplatný podpis.');
      const v = JSON.parse(rawBody.toString('utf8')).verification ?? {};
      return {
        providerId: v.id,
        approved: v.status === 'approved',
        final: ['approved', 'declined', 'expired', 'abandoned'].includes(v.status),
        reason: v.reason ?? v.status ?? '',
        person: {
          firstName: v.person?.firstName ?? '',
          lastName: v.person?.lastName ?? '',
          dateOfBirth: v.person?.dateOfBirth ?? '',
        },
        document: { country: v.document?.country ?? '', number: v.document?.number ?? '' },
      };
    },
  };
}
