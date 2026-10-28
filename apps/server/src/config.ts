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
  /**
   * Open Circle's website (docs/OPEN_CIRCLE.md): hostnames (comma-separated) that get its own
   * landing, support, privacy and terms pages at the root. They are always at /open-circle too.
   */
  OPEN_CIRCLE_HOSTS: z.string().default(''),
  /** Open Circle's name on its website; a placeholder until Steve picks one. */
  OPEN_CIRCLE_NAME: z.string().trim().min(1).max(30).default('Open Circle'),
  /** Open Circle's App Store link, once it is listed. */
  OPEN_CIRCLE_APP_STORE_URL: z.url().optional(),
  /** Open Circle's contact address; unset = SUPPORT_EMAIL. */
  OPEN_CIRCLE_SUPPORT_EMAIL: z.string().optional(),
  /** Store links shown on the landing page once the app is listed. */
  APP_STORE_URL: z.url().optional(),
  // The web app (PWA) address; invite emails link to its /sign-in?invite=CODE.
  WEB_APP_URL: z.url().optional(),
  /** This API host's public address (https://api.<domain>), for links in guest and prayer-chain emails. Unset = those emails are not sent. */
  PUBLIC_SITE_URL: z.url().optional(),
  PLAY_STORE_URL: z.url().optional(),
  /** Shared-link verification (/.well-known): Apple Developer Team ID; unset = no apple-app-site-association. */
  APPLE_TEAM_ID: z.string().regex(/^[A-Z0-9]{10}$/).optional(),
  /** Bundle IDs (iOS) and package names (Android) that open shared links: the store app and the staging build. */
  APP_LINK_APP_IDS: z.string().default('com.zoomatech.prayertower,com.zoomatech.prayertower.staging'),
  /** Comma-separated SHA-256 signing-certificate fingerprints for Android App Links; unset = no assetlinks.json. */
  ANDROID_CERT_SHA256: z.string().default(''),
  /**
   * Comma-separated emails made admin once they have signed up and confirmed
   * their address (checked at start-up and every 5 minutes). Saves running
   * `npm run grant-role` by hand for the first admin.
   */
  ADMIN_EMAILS: z.string().default(''),
  /** Crisis line on the support page and in removal notices: US (default), CA, GB or IE. */
  CRISIS_COUNTRY: z.string().default('US'),
  PORT: z.coerce.number().int().default(3000),
  OPENAI_API_KEY: z.string().optional(),
  /** Who checks new text for safety: openai, claude, local or off. Without that provider's key (or URL) it is off. */
  MODERATION_PROVIDER: z.enum(['openai', 'claude', 'local', 'off']).default('openai'),
  /** MODERATION_PROVIDER=local: an Ollama server on your own Mac, e.g. http://mac-mini.tailnet:11434. Unset = off. */
  LOCAL_MODEL_URL: z.url().optional(),
  /** The model Ollama runs for the safety check (any model that supports structured outputs). */
  LOCAL_MODERATION_MODEL: z.string().default('gpt-oss:20b'),
  ANTHROPIC_API_KEY: z.string().optional(),
  /** Claude model for moderation (MODERATION_PROVIDER=claude). */
  MODERATION_CLAUDE_MODEL: z.string().default('claude-opus-5-5'),
  /** Claude model for the "not God" conversation and the circle facilitator (both off until an admin turns them on). */
  AI_CHAT_MODEL: z.string().default('claude-opus-5-5'),
  /** Shared secret for the radio station worker (header x-station-key). Unset = no station. */
  STATION_API_KEY: z.string().min(24).optional(),
  /** In-app token purchase (App Store). Off until purchases_enabled is on AND the Apple root certificate is set. */
  APPLE_IAP_ENVIRONMENT: z.enum(['Sandbox', 'Production']).default('Sandbox'),
  /** The app's Apple ID (a number, App Store Connect → App Information). Required for Production. */
  APPLE_APP_APPLE_ID: z.coerce.number().int().positive().optional(),
  APPLE_BUNDLE_ID: z.string().default('com.zoomatech.prayertower'),
  /** Comma-separated paths to Apple root certificates (DER .cer, e.g. AppleRootCA-G3.cer). Unset = purchases can't be checked. */
  APPLE_ROOT_CA_PATHS: z.string().default(''),
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
  // Staff password for /api/docs in production (HTTP Basic, any user name). Unset = staff bearer tokens only, JSON only.
  API_DOCS_PASSWORD: z.string().min(16).optional(),
  /** Outgoing email (weekly digest), e.g. smtps://user:pass@smtp.example.com:465. Unset = no email. */
  SMTP_URL: z.string().optional(),
  /** Sender for outgoing email, e.g. "Prayer Tower <hello@example.org>". */
  MAIL_FROM: z.string().optional(),
  /** Comma-separated emails that get the pilot report every Monday (needs SMTP_URL). Unset = none. */
  SPONSOR_REPORT_TO: z.string().default(''),
  // Language of the sponsor email for addresses that aren't members (members get their app language).
  SPONSOR_REPORT_LANG: z.enum(['en', 'es']).default('en'),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  // Cross-posting from Facebook and Threads (docs/CROSSPOST.md). The browser extension needs none of these;
  // "Connect Threads" / "Connect Facebook" need their app's ID and secret, the public URL and the token key.
  /** The server's public https address, for the sign-in return link, e.g. https://api.prayertower.app. */
  CROSSPOST_PUBLIC_URL: z.url({ protocol: /^https$/ }).optional(),
  /** Encrypts stored Facebook and Threads tokens (any random text, 32+ characters). */
  CROSSPOST_TOKEN_KEY: z.string().min(32).optional(),
  /** Threads app ID and secret (Meta App Dashboard → the Threads use case → Settings). */
  THREADS_APP_ID: z.string().optional(),
  THREADS_APP_SECRET: z.string().optional(),
  /** The Verify Token typed into the Threads webhook settings. Unset = no webhook (polling only). */
  THREADS_WEBHOOK_VERIFY_TOKEN: z.string().min(16).optional(),
  /** Facebook app ID and secret (Meta App Dashboard → App settings → Basic). */
  FACEBOOK_APP_ID: z.string().optional(),
  FACEBOOK_APP_SECRET: z.string().optional(),
  FACEBOOK_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default('v26.0'),
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
