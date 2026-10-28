import { z } from 'zod';

const Env = z.object({
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@127.0.0.1:54322/postgres'),
  // Postgres connections per process (API and worker each). Keep API + worker under the database's limit.
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(10),
  SUPABASE_URL: z.string().default('http://127.0.0.1:54321'),
  SUPABASE_SECRET_KEY: z.string().optional(),
  /** Publishable key, only for the public account-deletion page's sign-in. */
  SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  /** Shown on the account-deletion page as the contact address. */
  SUPPORT_EMAIL: z.string().optional(),
  /** Public website: where the privacy policy and terms (.md) live; defaults to docs/legal in the repo. */
  SITE_LEGAL_DIR: z.string().optional(),
  /** Store links shown on the landing page once the app is listed. */
  APP_STORE_URL: z.url().optional(),
  PLAY_STORE_URL: z.url().optional(),
  /** Shared-link verification (/.well-known): Apple Developer Team ID; unset = no apple-app-site-association. */
  APPLE_TEAM_ID: z.string().regex(/^[A-Z0-9]{10}$/).optional(),
  /** Bundle IDs (iOS) and package names (Android) that open shared links: the store app and the staging build. */
  APP_LINK_APP_IDS: z.string().default('com.zoomatech.prayertower,com.zoomatech.prayertower.staging'),
  /** Comma-separated SHA-256 signing-certificate fingerprints for Android App Links; unset = no assetlinks.json. */
  ANDROID_CERT_SHA256: z.string().default(''),
  /** Crisis line on the support page and in removal notices: US (default), CA, GB or IE. */
  CRISIS_COUNTRY: z.string().default('US'),
  PORT: z.coerce.number().int().default(3000),
  OPENAI_API_KEY: z.string().optional(),
  /** Who checks new text for safety: openai, claude or off. Without that provider's key it is off. */
  MODERATION_PROVIDER: z.enum(['openai', 'claude', 'off']).default('openai'),
  ANTHROPIC_API_KEY: z.string().optional(),
  /** Claude model for moderation (MODERATION_PROVIDER=claude). */
  MODERATION_CLAUDE_MODEL: z.string().default('claude-opus-5-5'),
  /** Shared secret for the radio station worker (header x-station-key). Unset = no station. */
  STATION_API_KEY: z.string().min(24).optional(),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  PUSH_ENABLED: z.enum(['0', '1']).default('1'),
  /** Comma-separated origins allowed to call the API from a browser. Unset = any (development only). */
  CORS_ORIGINS: z.string().default(''),
  /** API requests allowed per signed-in member per minute; 0 turns the limit off. */
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(0).default(300),
  /** Error reporting (see src/instrument.ts); unset = off. Read straight from the environment there. */
  SENTRY_DSN: z.string().optional(),
  /** Bearer token for GET /metrics; unset = no metrics endpoint. */
  METRICS_TOKEN: z.string().min(24).optional(),
  /** Outgoing email (weekly digest), e.g. smtps://user:pass@smtp.example.com:465. Unset = no email. */
  SMTP_URL: z.string().optional(),
  /** Sender for outgoing email, e.g. "Prayer Tower <hello@example.org>". */
  MAIL_FROM: z.string().optional(),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  /** Days after a moderator removes content before its text and photos are erased (0 = never). */
  RETENTION_REMOVED_DAYS: z.coerce.number().int().min(0).default(90),
  /** Days notifications are kept (0 = forever). */
  RETENTION_NOTIFICATION_DAYS: z.coerce.number().int().min(0).default(90),
  /** Days finished queues are kept: handled deletion requests, dead push tokens, finished scheduled gifts (0 = forever). */
  RETENTION_QUEUE_DAYS: z.coerce.number().int().min(0).default(30),
});

export type Config = z.infer<typeof Env>;

/** Load apps/server/.env in development if present (production sets real env vars). */
export function loadDotEnv() {
  try {
    process.loadEnvFile('.env');
  } catch {
    // No .env file: use the environment as is.
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Treat empty strings from .env files as unset.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ''));
  return Env.parse(cleaned);
}

// Product constants that are still open decisions live here so they change in one place.
export const product = {
  /** Characters shown before "more" (200 vs 220 is undecided). */
  previewChars: 200,
  /** Max words per post. */
  maxPostWords: 1000,
  /** Tokens earned per Praying Now, at most once per post per UTC day. */
  prayingNowTokens: 1,
  /** Prayer prompts: minimum hours between prompts (members can lengthen it) and max per day. */
  promptMinHours: 12,
  promptsPerDay: 2,
} as const;
