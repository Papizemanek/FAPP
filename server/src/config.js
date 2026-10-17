// Konfigurace z proměnných prostředí. Ve vývoji má rozumné výchozí hodnoty,
// v produkci (NODE_ENV=production) chybějící tajemství zastaví start.

const DEV_DATA_KEY = Buffer.alloc(32, 7).toString('base64');

export function loadConfig(env = process.env) {
  const dev = env.NODE_ENV !== 'production';
  const required = (name, devDefault) => {
    if (env[name]) return env[name];
    if (dev) return devDefault;
    throw new Error(`Chybí proměnná prostředí ${name}.`);
  };
  const port = Number(env.PORT ?? 3000);

  const config = {
    dev,
    port,
    publicUrl: (env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, ''),
    dbFile: env.DB_FILE ?? 'fapp.db',
    dataKey: required('DATA_KEY', DEV_DATA_KEY),
    identitySecret: required('IDENTITY_SECRET', 'dev-identity-secret'),
    adminToken: required('ADMIN_TOKEN', 'dev-admin'),
    verificationProvider: env.VERIFICATION_PROVIDER ?? (dev ? 'dev' : 'veriff'),
    veriff: {
      baseUrl: env.VERIFF_BASE_URL ?? 'https://stationapi.veriff.com',
      apiKey: env.VERIFF_API_KEY,
      sharedSecret: env.VERIFF_SHARED_SECRET,
    },
    smsProvider: env.SMS_PROVIDER ?? (dev ? 'console' : 'twilio'),
    twilio: {
      accountSid: env.TWILIO_ACCOUNT_SID,
      authToken: env.TWILIO_AUTH_TOKEN,
      from: env.TWILIO_FROM,
      messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
    },
    pushProvider: env.PUSH_PROVIDER ?? (dev ? 'console' : 'expo'),
    // Start je zdarma. Placené úrovně se zapnou BILLING_MODE=paid (aplikace se nemusí měnit).
    billingMode: env.BILLING_MODE ?? 'free',
    // 'dev' = nákup tlačítkem bez platby (jen vývoj), 'revenuecat' = App Store a Google Play přes RevenueCat.
    paymentsProvider: env.PAYMENTS_PROVIDER ?? (dev ? 'dev' : 'revenuecat'),
    revenuecat: { webhookAuth: env.REVENUECAT_WEBHOOK_AUTH },
    // Web s čekací listinou: adresy, ze kterých smí posílat formulář (CORS), a složka se sestaveným webem.
    webOrigins: (env.WEB_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    webDir: env.WEB_DIR ?? new URL('../../web/dist/', import.meta.url).pathname,
  };

  if (!['free', 'paid'].includes(config.billingMode)) throw new Error('BILLING_MODE musí být free nebo paid.');
  if (!['dev', 'revenuecat'].includes(config.paymentsProvider)) throw new Error('PAYMENTS_PROVIDER musí být dev nebo revenuecat.');
  if (!dev && config.paymentsProvider === 'dev') throw new Error('Vývojové platby nesmí běžet v produkci.');
  if (!dev && config.billingMode === 'paid' && !config.revenuecat.webhookAuth) {
    throw new Error('Chybí proměnná prostředí REVENUECAT_WEBHOOK_AUTH.');
  }

  if (!dev && config.verificationProvider === 'dev') {
    throw new Error('Vývojové ověření totožnosti nesmí běžet v produkci.');
  }
  if (dev && !env.DATA_KEY) console.warn('[config] DATA_KEY není nastavený – používám vývojový klíč.');
  return config;
}
