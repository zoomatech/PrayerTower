import { z } from 'zod';

const Env = z.object({
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@127.0.0.1:54322/postgres'),
  SUPABASE_URL: z.string().default('http://127.0.0.1:54321'),
  SUPABASE_SECRET_KEY: z.string().optional(),
  PORT: z.coerce.number().int().default(3000),
  OPENAI_API_KEY: z.string().optional(),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  PUSH_ENABLED: z.enum(['0', '1']).default('1'),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
});

export type Config = z.infer<typeof Env>;

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
