// Load test for a LOCAL stack: N members sign in through Supabase Auth and use
// the running API the way the app does (read the feed, open a request, check
// notifications, pray, now and then post). Reports latency per route.
//
//   npm run dev:api                       (in another terminal, or the built server)
//   npm run load-test -w @prayer-tower/server
//
// Env: LOAD_STAGES=10,50,100 (members per stage), LOAD_SECONDS=30 (per stage),
// LOAD_THINK_MS=1000 (pause between a member's actions; 0 = flat out),
// API_URL=http://127.0.0.1:3000. Local Supabase allows 30 sign-ins per 5 minutes
// per IP (supabase/config.toml [auth.rate_limit] sign_in_sign_ups); raise it on
// your machine before a run with more members, and set RATE_LIMIT_PER_MINUTE=0
// on the API (every member shares one IP for the unauthenticated limit).
import { loadConfig, loadDotEnv } from '../config.js';
import { createPool } from '../db.js';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const isLocal = (url: string) => {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
};

loadDotEnv();
const config = loadConfig();
const apiUrl = (process.env.API_URL ?? `http://127.0.0.1:${config.PORT}`).replace(/\/$/, '');
if (!isLocal(config.DATABASE_URL) || !isLocal(config.SUPABASE_URL) || !isLocal(apiUrl)) {
  console.error('load-test only runs against a local stack. Nothing was changed.');
  process.exit(1);
}
if (!config.SUPABASE_SECRET_KEY || !config.SUPABASE_PUBLISHABLE_KEY) {
  console.error('Set SUPABASE_SECRET_KEY and SUPABASE_PUBLISHABLE_KEY (from `npx supabase status -o env`).');
  process.exit(1);
}

const stages = (process.env.LOAD_STAGES ?? '10,50,100').split(',').map(Number).filter((n) => n > 0);
const seconds = Number(process.env.LOAD_SECONDS ?? 30);
const thinkMs = Number(process.env.LOAD_THINK_MS ?? 1000);
const password = 'load-test-pass-1';
const domain = 'load.prayertower.local';
const auth = `${config.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`;
const db = createPool(config.DATABASE_URL);

async function member(i: number): Promise<{ id: string; token: string }> {
  const email = `load${i}@${domain}`;
  const admin = { apikey: config.SUPABASE_SECRET_KEY!, authorization: `Bearer ${config.SUPABASE_SECRET_KEY}`, 'content-type': 'application/json' };
  await fetch(`${auth}/admin/users`, {
    method: 'POST',
    headers: admin,
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { display_name: `Load ${i}` }, app_metadata: { invite_exempt: true } }),
  }); // 422 when the member already exists from an earlier run
  const r = await fetch(`${auth}/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: config.SUPABASE_PUBLISHABLE_KEY!, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const s = (await r.json()) as { access_token?: string; user?: { id: string }; msg?: string };
  if (!s.access_token || !s.user) throw new Error(`sign-in failed for ${email}: ${JSON.stringify(s)}`);
  return { id: s.user.id, token: s.access_token };
}

const samples = new Map<string, number[]>();
const failures = new Map<string, number>();
async function call(token: string, route: string, method: string, path: string, body?: object): Promise<unknown> {
  const t0 = performance.now();
  let status = 0;
  let json: unknown = null;
  try {
    const res = await fetch(`${apiUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    status = res.status;
    json = await res.json().catch(() => null);
  } catch {
    status = 0;
  }
  const ms = performance.now() - t0;
  (samples.get(route) ?? samples.set(route, []).get(route)!).push(ms);
  // 4xx from rules (already prayed, limits) are expected; count server errors and dropped connections.
  if (status === 0 || status >= 500) failures.set(route, (failures.get(route) ?? 0) + 1);
  return status < 400 ? json : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!;

async function session(m: { token: string }, until: number, postIds: string[]) {
  while (Date.now() < until) {
    const r = Math.random();
    if (r < 0.4) {
      const feed = (await call(m.token, 'GET /feed', 'GET', '/feed')) as { posts?: { id: string }[] } | null;
      for (const p of feed?.posts?.slice(0, 5) ?? []) if (!postIds.includes(p.id)) postIds.push(p.id);
    } else if (r < 0.6 && postIds.length) {
      const id = pick(postIds);
      await call(m.token, 'GET /posts/:id', 'GET', `/posts/${id}`);
      await call(m.token, 'GET /posts/:id/comments', 'GET', `/posts/${id}/comments`);
    } else if (r < 0.75) {
      await call(m.token, 'GET /me/notifications', 'GET', '/me/notifications');
    } else if (r < 0.85) {
      await call(m.token, 'GET /me', 'GET', '/me');
    } else if (r < 0.97 && postIds.length) {
      await call(m.token, 'POST /posts/:id/praying-now', 'POST', `/posts/${pick(postIds)}/praying-now`, { durationSeconds: 30 });
    } else {
      await call(m.token, 'POST /posts', 'POST', '/posts', { postType: 'prayer_request', body: `Load test request ${Date.now()}: please pray for steady work this week.` });
    }
    if (thinkMs) await sleep(thinkMs * (0.5 + Math.random()));
  }
}

const pct = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] ?? 0;

const max = Math.max(...stages);
console.log(`Signing in ${max} load-test members...`);
const members: { id: string; token: string }[] = [];
for (let i = 0; i < max; i++) members.push(await member(i));
// Seasoned and onboarded, so new-member limits don't turn the test into 4xx.
await db.query(`update public.profiles set onboarded_at = now(), created_at = now() - interval '60 days' where id = any($1)`, [members.map((m) => m.id)]);
const postIds: string[] = [];
for (const m of members.slice(0, 20)) {
  const p = (await call(m.token, 'seed', 'POST', '/posts', { postType: 'prayer_request', body: 'Load test seed request: please pray for my family.' })) as { id?: string } | null;
  if (p?.id) postIds.push(p.id);
}
samples.clear();
failures.clear();

const report: string[] = [];
for (const n of stages) {
  samples.clear();
  failures.clear();
  const until = Date.now() + seconds * 1000;
  const t0 = Date.now();
  await Promise.all(members.slice(0, n).map((m) => session(m, until, postIds)));
  const elapsed = (Date.now() - t0) / 1000;
  const total = [...samples.values()].reduce((a, xs) => a + xs.length, 0);
  const errs = [...failures.values()].reduce((a, b) => a + b, 0);
  report.push(`\n### ${n} members, ${seconds}s, think ${thinkMs}ms: ${(total / elapsed).toFixed(1)} req/s, ${total} requests, ${errs} server errors\n`);
  report.push('| Route | Requests | p50 ms | p95 ms | p99 ms | Max ms | 5xx/dropped |', '|---|---|---|---|---|---|---|');
  for (const [route, xs] of [...samples.entries()].sort()) {
    xs.sort((a, b) => a - b);
    report.push(`| ${route} | ${xs.length} | ${pct(xs, 50).toFixed(0)} | ${pct(xs, 95).toFixed(0)} | ${pct(xs, 99).toFixed(0)} | ${xs.at(-1)!.toFixed(0)} | ${failures.get(route) ?? 0} |`);
  }
  console.log(report.slice(-(samples.size + 3)).join('\n'));
}
await db.end();
console.log('\n--- Markdown ---' + report.join('\n'));
