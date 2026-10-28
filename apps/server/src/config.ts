import { z } from 'zod';

const Env = z.object({
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@127.0.0.1:54322/postgres'),
  SUPABASE_URL: z.string().default('http://127.0.0.1:54321'),
  SUPABASE_SECRET_KEY: z.string().optional(),
  /** Publishable key, only for the public account-deletion page's sign-in. */
  SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  /** Shown on the account-deletion page as the contact address. */
  SUPPORT_EMAIL: z.string().optional(),
  PORT: z.coerce.number().int().default(3000),
  OPENAI_API_KEY: z.string().optional(),
  /** Shared secret for the radio station worker (header x-station-key). Unset = no station. */
  STATION_API_KEY: z.string().min(24).optional(),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  PUSH_ENABLED: z.enum(['0', '1']).default('1'),
  /** Comma-separated origins allowed to call the API from a browser. Unset = any (development only). */
  CORS_ORIGINS: z.string().default(''),
  /** API requests allowed per signed-in member per minute; 0 turns the limit off. */
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(0).default(300),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
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
