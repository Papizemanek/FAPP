import express from 'express';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createSealer } from './crypto.js';
import { adminRoutes } from './routes/admin.js';
import { agreementRoutes } from './routes/agreements.js';
import { authRoutes } from './routes/auth.js';
import { billingRoutes } from './routes/billing.js';
import { discoverRoutes } from './routes/discover.js';
import { imageRoutes } from './routes/images.js';
import { matchRoutes } from './routes/matches.js';
import { profileRoutes } from './routes/profile.js';
import { reportRoutes } from './routes/reports.js';
import { safetyRoutes } from './routes/safety.js';
import { shareRoutes } from './routes/share.js';
import { verificationRoutes } from './routes/verification.js';
import { createAlerts } from './services/alerts.js';
import { createLimiter } from './services/ratelimit.js';

const require = createRequire(import.meta.url);
const leafletDir = path.dirname(require.resolve('leaflet/dist/leaflet.js'));

export function createApp({ db, config, services, rateLimit = true }) {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);

  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'no-referrer');
    if (!config.dev) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
  // rawBody je potřeba pro ověření podpisu webhooku ověřovací služby.
  app.use(express.json({ limit: '4mb', verify: (req, _res, buf) => (req.rawBody = buf) }));

  const ctx = {
    db,
    config,
    services,
    sealer: createSealer(config.dataKey),
    alerts: createAlerts({ db, sms: services.sms }),
    limiter: createLimiter({ enabled: rateLimit }),
  };

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/vendor/leaflet', express.static(leafletDir, { maxAge: '7d' }));
  app.use(shareRoutes(ctx));
  app.use('/api/auth', authRoutes(ctx));
  app.use('/api/me', profileRoutes(ctx));
  app.use('/api/verification', verificationRoutes(ctx));
  app.use('/api/images', imageRoutes(ctx));
  app.use('/api', discoverRoutes(ctx));
  app.use('/api', billingRoutes(ctx));
  app.use('/api', agreementRoutes(ctx));
  app.use('/api', safetyRoutes(ctx));
  app.use('/api', reportRoutes(ctx));
  app.use('/api/matches', matchRoutes(ctx));
  app.use('/api/admin', adminRoutes(ctx));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Nenalezeno.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Požadavek je příliš velký.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Neplatný JSON.' });
    if (err.status && err.status < 500) return res.status(err.status).json({ ...err.data, error: err.message });
    console.error(err);
    res.status(err.status ?? 500).json({ error: err.status ? err.message : 'Něco se pokazilo. Zkus to znovu.' });
  });

  return { app, ctx };
}
