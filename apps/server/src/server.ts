import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { runMigrations } from 'graphile-worker';
import { appleVerifier } from './modules/store/index.js';
import { buildApp } from './app.js';
import { createConverser } from './modules/ai/provider.js';
import { supabaseJwksVerifier } from './auth.js';
import { loadConfig, loadDotEnv } from './config.js';
import { createPool } from './db.js';
import { bootstrapAdmins } from './modules/accounts/index.js';
import { createMailer } from './modules/digest/mailer.js';
import { createClassifier } from './modules/moderation/providers.js';
import { crosspostOptions } from './modules/crosspost/meta.js';
import { defaultLegalDir } from './modules/site/index.js';

loadDotEnv();
const config = loadConfig();
const db = createPool(config.DATABASE_URL, config.DATABASE_POOL_MAX);

// The API enqueues jobs, so the job queue schema must exist before it serves.
await runMigrations({ pgPool: db });

// The version in the API docs follows apps/server/package.json (set by npm run release). It is one
// folder up from src/server.ts (development) and two up from dist/src/server.js (the built image).
const serverVersion = () => {
  const file = [new URL('../package.json', import.meta.url), new URL('../../package.json', import.meta.url)].find((u) => existsSync(u));
  return file ? (JSON.parse(readFileSync(file, 'utf8')) as { version: string }).version : 'unknown';
};

const storage = config.SUPABASE_SECRET_KEY
  ? createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
  : null;

function appLinks(c: typeof config) {
  const list = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);
  const ids = list(c.APP_LINK_APP_IDS);
  return {
    appleAppIds: c.APPLE_TEAM_ID ? ids.map((id) => `${c.APPLE_TEAM_ID}.${id}`) : [],
    androidPackages: ids,
    androidFingerprints: list(c.ANDROID_CERT_SHA256).map((f) => f.toUpperCase()),
  };
}

const app = buildApp({
  db,
  verifyToken: supabaseJwksVerifier(config.SUPABASE_URL),
  storage,
  logger: true,
  classify: createClassifier(config),
  converse: createConverser(config),
  stationKey: config.STATION_API_KEY ?? null,
  rateLimitPerMinute: config.RATE_LIMIT_PER_MINUTE,
  clientIpHeader: config.CLIENT_IP_HEADER ?? null,
  metricsToken: config.METRICS_TOKEN ?? null,
  mailer: createMailer(config),
  webAppUrl: config.WEB_APP_URL ?? null,
  appleVerifier: appleVerifier(config),
  crosspost: crosspostOptions(config),
  apiDocs: { restricted: process.env.NODE_ENV === 'production', password: config.API_DOCS_PASSWORD ?? null, version: serverVersion() },
  deletionPage: { supabaseUrl: config.SUPABASE_URL, publishableKey: config.SUPABASE_PUBLISHABLE_KEY ?? null, supportEmail: config.SUPPORT_EMAIL ?? null },
  site: {
    supportEmail: config.SUPPORT_EMAIL ?? null,
    legalDir: config.SITE_LEGAL_DIR ?? defaultLegalDir(),
    appStoreUrl: config.APP_STORE_URL ?? null,
    playStoreUrl: config.PLAY_STORE_URL ?? null,
    crisisCountry: config.CRISIS_COUNTRY,
    appLinks: appLinks(config),
    openCircle: {
      name: config.OPEN_CIRCLE_NAME,
      hosts: config.OPEN_CIRCLE_HOSTS.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean),
      appStoreUrl: config.OPEN_CIRCLE_APP_STORE_URL ?? null,
      supportEmail: config.OPEN_CIRCLE_SUPPORT_EMAIL ?? null,
    },
  },
  corsOrigins: config.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
});

const shutdown = async () => {
  await app.close();
  await db.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: config.PORT, host: '0.0.0.0' });

// First admins from ADMIN_EMAILS, once they've signed up and confirmed their address.
const adminEmails = config.ADMIN_EMAILS.split(',');
const makeAdmins = () =>
  bootstrapAdmins(db, adminEmails, { viaEmail: process.env.NODE_ENV === 'production' }).then(
    ({ made, unverified }) => {
      if (made) app.log.info({ admins: made }, 'made admin from ADMIN_EMAILS');
      if (unverified)
        app.log.warn(
          { accounts: unverified },
          'ADMIN_EMAILS: not made admin because no confirmation email was sent. Turn on Authentication → Sign In / Providers → Confirm email in Supabase, or use npm run grant-role',
        );
    },
    (e) => app.log.error(e, 'ADMIN_EMAILS check failed'),
  );
// Always once, so removing an address from ADMIN_EMAILS also stops it skipping the invite code.
makeAdmins();
if (config.ADMIN_EMAILS.trim()) setInterval(makeAdmins, 5 * 60_000).unref();
