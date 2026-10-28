import { createClient } from '@supabase/supabase-js';
import { runMigrations } from 'graphile-worker';
import { buildApp } from './app.js';
import { supabaseJwksVerifier } from './auth.js';
import { loadConfig, loadDotEnv } from './config.js';
import { createPool } from './db.js';
import { openAiClassifier } from './modules/moderation/index.js';

loadDotEnv();
const config = loadConfig();
const db = createPool(config.DATABASE_URL);

// The API enqueues jobs, so the job queue schema must exist before it serves.
await runMigrations({ pgPool: db });

const storage = config.SUPABASE_SECRET_KEY
  ? createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
  : null;

const app = buildApp({
  db,
  verifyToken: supabaseJwksVerifier(config.SUPABASE_URL),
  storage,
  logger: true,
  classify: openAiClassifier(config),
  stationKey: config.STATION_API_KEY ?? null,
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
