import { randomUUID } from 'node:crypto';
import { runMigrations, runOnce } from 'graphile-worker';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db.js';
import type { Classifier } from '../src/modules/moderation/index.js';
import { buildTaskList } from '../src/tasks.js';

// Integration tests run against the local Supabase stack (`npm run db:start`).
export const config = { ...loadConfig(), PUSH_ENABLED: '0' as const };
export const db = createPool(config.DATABASE_URL);
export const STATION_KEY = 'test-station-key-0123456789abcdef';
await runMigrations({ pgPool: db });
// New-member limits would trip most tests, which use brand-new accounts; safety.test.ts turns them on.
await db.query('update public.safety_settings set new_member_limits_enabled = false');

/** Tests authenticate with "Bearer test:<userId>"; the real JWKS verifier is covered in auth.test.ts. */
export const app = buildApp({
  db,
  verifyToken: async (token) => {
    if (!token.startsWith('test:')) throw new Error('bad token');
    return token.slice(5);
  },
  classify: (text) => classifier(text),
  stationKey: STATION_KEY,
});

export let classifier: Classifier = async () => null;
export const setClassifier = (c: Classifier) => (classifier = c);

/** Run every queued job to completion. */
export async function drainJobs() {
  await runOnce({
    pgPool: db,
    taskList: buildTaskList(db, config, { classify: (text) => classifier(text) }),
  });
}

/** Create an auth user; the database trigger creates the profile. */
export async function createUser(displayName: string) {
  const id = randomUUID();
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data, aud, role) values ($1, $2, $3, 'authenticated', 'authenticated')`,
    [id, `${id}@test.local`, { display_name: displayName }],
  );
  return id;
}

export function as(userId: string) {
  const headers = { authorization: `Bearer test:${userId}` };
  return {
    get: (url: string) => app.inject({ method: 'GET', url, headers }),
    post: (url: string, payload?: object) => app.inject({ method: 'POST', url, headers, payload: payload ?? {} }),
    patch: (url: string, payload: object) => app.inject({ method: 'PATCH', url, headers, payload }),
    put: (url: string, payload?: object) => app.inject({ method: 'PUT', url, headers, ...(payload ? { payload } : {}) }),
    delete: (url: string) => app.inject({ method: 'DELETE', url, headers }),
  };
}

export async function newRequest(userId: string, body = 'Please pray for my father, surgery on Tuesday.', extra: object = {}) {
  const res = await as(userId).post('/posts', { postType: 'prayer_request', body, ...extra });
  if (res.statusCode !== 201) throw new Error(`create post failed: ${res.body}`);
  return res.json().post as { id: string; crisis: boolean };
}
