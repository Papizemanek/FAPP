import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { createEmail } from './services/email.js';
import { createPush } from './services/push.js';
import { createSms } from './services/sms.js';
import { createVerification } from './services/verification.js';
import { startWatchdog } from './services/watchdog.js';

const config = loadConfig();
const db = openDb(config.dbFile);
const services = {
  sms: createSms(config),
  verification: createVerification(config),
  push: createPush(config),
  email: createEmail(config),
};
const { app, ctx } = createApp({ db, config, services });
startWatchdog(ctx);

app.listen(config.port, () => {
  console.log(`YesYes server běží na ${config.publicUrl} (ověření: ${services.verification.name}, SMS: ${services.sms.name})`);
});
