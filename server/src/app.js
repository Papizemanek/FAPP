import express from 'express';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { accessGate } from './accessGate.js';
import { createSealer } from './crypto.js';
import { localeFromRequest, tr } from './i18n.js';
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
import { waitlistRoutes } from './routes/waitlist.js';
import { createAlerts } from './services/alerts.js';
import { createLimiter } from './services/ratelimit.js';
import { HttpError } from './util.js';

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
  if (config.accessKey) app.use(accessGate(config.accessKey));
  // Jazyk odpovědi (chyby). requireAuth ho upřesní podle uloženého jazyka uživatele.
  app.use((req, _res, next) => {
    req.locale = localeFromRequest(req);
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
  app.use('/api', waitlistRoutes(ctx));

  app.use('/api', (req, res) => res.status(404).json({ error: tr(req.locale, 'errors.notFound') }));

  // Webová verze aplikace: jedna stránka pro všechny cesty (trasy řeší aplikace sama).
  const webAppIndex = path.join(config.webAppDir ?? '', 'index.html');
  if (config.webApp && fs.existsSync(webAppIndex)) {
    app.get('/manifest.webmanifest', (_req, res) => {
      res.type('application/manifest+json').json({
        name: 'YesYes',
        short_name: 'YesYes',
        // Ikona na ploše iPhonu startuje přes pozvánku – má vlastní úložiště a cookie z Safari nevidí.
        start_url: config.accessKey ? `/app/${encodeURIComponent(config.accessKey)}` : '/',
        scope: '/',
        display: 'standalone',
        background_color: '#121014',
        theme_color: '#121014',
        icons: [{ src: '/icon.png', sizes: '1024x1024', type: 'image/png' }],
      });
    });
    app.get('/icon.png', (_req, res) => res.sendFile(path.join(config.webAppDir, 'icon.png')));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(webAppIndex);
    });
  }

  // Sestavený web (npm run build -w web) – pokud existuje, server ho rovnou servíruje na /.
  if (config.webDir && fs.existsSync(path.join(config.webDir, 'index.html'))) {
    app.use(express.static(config.webDir, { maxAge: '1h', extensions: ['html'] }));
  }

  // Chyby se překládají až tady, podle jazyka požadavku. params slouží jen k překladu a do odpovědi nejdou.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const locale = req.locale ?? localeFromRequest(req);
    if (err.type === 'entity.too.large') return res.status(413).json({ error: tr(locale, 'errors.tooLarge') });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: tr(locale, 'errors.invalidJson') });
    if (err instanceof HttpError) {
      if (err.status >= 500) console.error(err);
      return res.status(err.status).json({ ...err.data, error: tr(locale, err.key, err.params) });
    }
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(err.status ?? 500).json({ error: tr(locale, 'errors.internal') });
  });

  return { app, ctx };
}
