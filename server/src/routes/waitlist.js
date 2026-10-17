import { Router } from 'express';
import { createHmac } from 'node:crypto';
import { normalizeLocale } from '../i18n.js';
import { HttpError, email, nowIso } from '../util.js';

// Čekací listina z webu. E-mail je zašifrovaný; duplicitu poznáme podle HMAC otisku.
// Odpověď je pro nový i už zapsaný e-mail stejná, aby z ní nešlo zjistit, kdo na listině je.

const CITIES = new Set(['praha', 'brno', 'ostrava', 'plzen', 'olomouc', 'liberec', 'other']);

export function waitlistRoutes({ db, config, sealer, limiter }) {
  const r = Router();

  // Web může běžet na jiné doméně než API – povolené adresy jsou ve WEB_ORIGINS.
  const cors = (req, res, next) => {
    const origin = req.get('origin');
    if (origin && config.webOrigins.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Accept-Language');
      res.set('Access-Control-Max-Age', '600');
    }
    next();
  };

  r.options('/waitlist', cors, (_req, res) => res.status(204).end());

  r.post('/waitlist', cors, limiter('waitlist', 10), (req, res) => {
    const address = email(req.body?.email);
    if (req.body?.consent !== true) throw new HttpError(400, 'auth.acceptRules');
    const city = CITIES.has(req.body?.city) ? req.body.city : 'other';
    const locale = normalizeLocale(req.body?.locale) ?? req.locale;
    const hash = createHmac('sha256', config.identitySecret).update(`waitlist|${address}`).digest('hex');
    db.prepare('INSERT OR IGNORE INTO waitlist (email_hash, email, city, locale, created_at) VALUES (?, ?, ?, ?, ?)').run(
      hash,
      sealer.seal(address),
      city,
      locale,
      nowIso(),
    );
    res.status(201).json({ ok: true });
  });

  return r;
}
