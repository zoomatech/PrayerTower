import { createClient } from '@supabase/supabase-js';
import { runMigrations } from 'graphile-worker';
import { buildApp } from './app.js';
import { supabaseJwksVerifier } from './auth.js';
import { loadConfig, loadDotEnv } from './config.js';
import { createPool } from './db.js';
import { createClassifier } from './modules/moderation/providers.js';
import { defaultLegalDir } from './modules/site/index.js';

loadDotEnv();
const config = loadConfig();
const db = createPool(config.DATABASE_URL, config.DATABASE_POOL_MAX);

// The API enqueues jobs, so the job queue schema must exist before it serves.
await runMigrations({ pgPool: db });

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
  stationKey: config.STATION_API_KEY ?? null,
  rateLimitPerMinute: config.RATE_LIMIT_PER_MINUTE,
  metricsToken: config.METRICS_TOKEN ?? null,
  deletionPage: { supabaseUrl: config.SUPABASE_URL, publishableKey: config.SUPABASE_PUBLISHABLE_KEY ?? null, supportEmail: config.SUPPORT_EMAIL ?? null },
  site: {
    supportEmail: config.SUPPORT_EMAIL ?? null,
    legalDir: config.SITE_LEGAL_DIR ?? defaultLegalDir(),
    appStoreUrl: config.APP_STORE_URL ?? null,
    playStoreUrl: config.PLAY_STORE_URL ?? null,
    crisisCountry: config.CRISIS_COUNTRY,
    appLinks: appLinks(config),
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
