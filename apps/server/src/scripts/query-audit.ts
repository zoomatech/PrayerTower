// Database query audit for a LOCAL stack: seeds 1,000 members with realistic
// activity, drives the API the way the app does (in-process, as members and an
// admin), records every SQL statement the server runs, and EXPLAIN ANALYZEs the
// 20 that cost the most in total. Writes docs/QUERY_AUDIT_RESULTS.md.
//
//   npm run query-audit -w @prayer-tower/server            seed, audit, remove the seed
//   npm run query-audit -w @prayer-tower/server -- --keep  leave the 1,000 members in place
//
// Env: AUDIT_MEMBERS=1000, AUDIT_ROUNDS=3 (passes over the routes).
// Never runs against a hosted database. docs/QUERY_AUDIT.md explains the results.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig, loadDotEnv } from '../config.js';
import { createPool } from '../db.js';
import { grantRole } from '../modules/accounts/index.js';
import { buildDigest } from '../modules/digest/index.js';
import { findProblems } from '../modules/tokens/ledger-check.js';

loadDotEnv();
const config = loadConfig();
const host = new URL(config.DATABASE_URL).hostname;
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
  console.error('query-audit only runs against a local database. Nothing was changed.');
  process.exit(1);
}
const MEMBERS = Number(process.env.AUDIT_MEMBERS ?? 1000);
const ROUNDS = Number(process.env.AUDIT_ROUNDS ?? 3);
const keep = process.argv.includes('--keep');
const DOMAIN = 'audit.prayertower.local';

// Record every statement the server sends (pool and transaction clients alike).
interface Seen {
  text: string;
  values: unknown[];
  ms: number;
}
const seen: Seen[] = [];
let recording = false;
const original = pg.Client.prototype.query as (...a: unknown[]) => unknown;
pg.Client.prototype.query = function (this: pg.Client, ...args: unknown[]) {
  const first = args[0] as string | { text?: string; values?: unknown[] };
  const text = typeof first === 'string' ? first : first?.text;
  const values = (typeof first === 'string' ? args[1] : first?.values) as unknown[] | undefined;
  if (!recording || !text || /^\s*(begin|commit|rollback|savepoint|release)/i.test(text)) return original.apply(this, args);
  const t0 = performance.now();
  const record = () => seen.push({ text, values: Array.isArray(values) ? values : [], ms: performance.now() - t0 });
  // pg-pool calls client.query(text, values, callback); everything else uses the promise.
  const last = args.at(-1);
  if (typeof last === 'function') {
    args[args.length - 1] = (err: unknown, res: unknown) => {
      if (!err) record();
      return (last as (e: unknown, r: unknown) => unknown)(err, res);
    };
    return original.apply(this, args);
  }
  const result = original.apply(this, args);
  if (result instanceof Promise) result.then(record, () => undefined);
  return result;
} as typeof pg.Client.prototype.query;

const db = createPool(config.DATABASE_URL, 10);

async function seed() {
  const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from auth.users where email like $1`, [`%@${DOMAIN}`]);
  if (rows[0]!.n >= MEMBERS) return console.log(`Seed already in place (${rows[0]!.n} members).`);
  if (rows[0]!.n) await removeSeed();
  console.log(`Seeding ${MEMBERS} members and their activity (about a minute)...`);
  const t0 = Date.now();
  // One transaction, so a failed seed leaves nothing behind.
  const tx = await db.connect();
  await tx.query('begin');
  await tx.query(
    `insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data, aud, role, created_at)
     select gen_random_uuid(), 'audit' || i || '@${DOMAIN}', jsonb_build_object('display_name', 'Audit ' || i, 'locale', case when i % 5 = 0 then 'es' else 'en' end),
            '{"invite_exempt": true}'::jsonb, 'authenticated', 'authenticated', now() - interval '90 days'
       from generate_series(1, $1) i`,
    [MEMBERS],
  );
  await tx.query(
    `update public.profiles p set onboarded_at = now() - interval '89 days', created_at = now() - interval '90 days'
       from auth.users u where u.id = p.id and u.email like $1`,
    [`%@${DOMAIN}`],
  );
  const members = `(select p.id, row_number() over (order by p.id) as n from public.profiles p join auth.users u on u.id = p.id where u.email like '%@${DOMAIN}')`;
  // 5 requests each over 60 days.
  await tx.query(
    `insert into public.posts (user_id, post_type, body, created_at)
     select m.id, 'prayer_request', 'Audit request ' || m.n || '-' || k || ': please pray for my family and for steady work this season.',
            now() - (random() * interval '60 days')
       from ${members} m, generate_series(1, 5) k`,
  );
  const posts = `(select p.id, p.user_id, p.created_at, row_number() over (order by p.id) as n from public.posts p join auth.users u on u.id = p.user_id where u.email like '%@${DOMAIN}')`;
  // Everyone follows 30 others.
  await tx.query(
    `insert into public.follows (user_id, followee_id)
     select a.id, b.id from ${members} a join ${members} b on b.n <> a.n and ((b.n - a.n + $1) % $1) between 1 and 30
     on conflict do nothing`,
    [MEMBERS],
  );
  // 20 prayers and 2 comments per request, from other members.
  await tx.query(
    `insert into public.prayer_events (post_id, user_id, kind, duration_seconds, created_at)
     select p.id, m.id, 'praying_now', 30, p.created_at + (k * interval '17 minutes')
       from ${posts} p, generate_series(1, 20) k join lateral (select id from ${members} mm where mm.n = 1 + ((k * 37) % $1)) m on true
      where m.id <> p.user_id`,
    [MEMBERS],
  );
  await tx.query(
    `insert into public.comments (post_id, user_id, body, created_at)
     select p.id, m.id, 'Praying for you, friend.', p.created_at + (k * interval '1 hour')
       from ${posts} p, generate_series(1, 2) k join lateral (select id from ${members} mm where mm.n = 1 + ((k * 53) % $1)) m on true`,
    [MEMBERS],
  );
  // 60 notifications per member, a third unread.
  await tx.query(
    `insert into public.notifications (user_id, kind, title, body, data, read_at, created_at)
     select m.id, 'prayed_for_you', 'Someone prayed for you', 'Someone is praying for your request.', '{}'::jsonb,
            case when k % 3 = 0 then null else now() end, now() - (k * interval '1 day')
       from ${members} m, generate_series(1, 60) k`,
  );
  // 500 direct conversations with 20 messages each.
  await tx.query(
    `with c as (
       insert into public.conversations (kind, community_id, created_by, last_message_at)
       select 'direct', public.default_community_id(), m.id, now() from ${members} m where m.n <= $1 / 2 returning id, created_by
     ), pairs as (
       select c.id, c.created_by as a, (select id from ${members} mm where mm.n = (select n from ${members} x where x.id = c.created_by) + $1 / 2) as b from c
     ), mem as (
       insert into public.conversation_members (conversation_id, user_id, status)
       select id, a, 'active'::public.conversation_member_status from pairs union all select id, b, 'active'::public.conversation_member_status from pairs returning conversation_id
     )
     insert into public.messages (conversation_id, community_id, user_id, body, created_at)
     select p.id, public.default_community_id(), case when k % 2 = 0 then p.a else p.b end, 'Thank you for praying with me.', now() - (k * interval '1 hour')
       from pairs p, generate_series(1, 20) k`,
    [MEMBERS],
  );
  await tx.query('commit');
  tx.release();
  await db.query('analyze');
  console.log(`Seeded in ${((Date.now() - t0) / 1000).toFixed(0)}s.`);
}

async function removeSeed() {
  console.log('Removing the audit members...');
  await db.query(`delete from public.conversations c where exists (select 1 from auth.users u where u.id = c.created_by and u.email like $1)`, [`%@${DOMAIN}`]);
  // Profiles don't cascade from auth.users (account deletion removes them itself).
  await db.query(`delete from public.profiles p using auth.users u where u.id = p.id and u.email like $1`, [`%@${DOMAIN}`]);
  await db.query(`delete from auth.users where email like $1`, [`%@${DOMAIN}`]);
}

const SEEN_ROUTES: string[] = [];
async function drive() {
  const app = buildApp({ db, verifyToken: async (t) => t, logger: false });
  await app.ready();
  const { rows: ms } = await db.query<{ id: string }>(
    `select p.id from public.profiles p join auth.users u on u.id = p.id where u.email like $1 order by p.id limit 50`,
    [`%@${DOMAIN}`],
  );
  const admin = ms[0]!.id;
  await grantRole(db, admin, 'admin', null);
  await grantRole(db, admin, 'moderator', null);
  const call = async (user: string, method: 'GET' | 'POST', url: string, payload?: object) => {
    const r = await app.inject({ method, url, headers: { authorization: `Bearer ${user}` }, ...(payload ? { payload } : {}) });
    if (!SEEN_ROUTES.includes(`${method} ${url.replace(/[0-9a-f-]{36}/g, ':id')} → ${r.statusCode}`)) SEEN_ROUTES.push(`${method} ${url.replace(/[0-9a-f-]{36}/g, ':id')} → ${r.statusCode}`);
    return r.statusCode < 400 ? r.json() : null;
  };
  const memberRoutes = [
    '/feed', '/feed?page=1', '/me', '/me/notifications', '/me/tokens', '/me/tier', '/me/conversations', '/me/commitments', '/me/following',
    '/me/followers', '/me/connections', '/me/prompt', '/me/events', '/events', '/highlights', '/announcements', '/groups', '/me/power-prayer',
  ];
  const adminRoutes = ['/admin/metrics', '/admin/pilot-report', '/admin/people', '/admin/audit-log', '/admin/prayer-warriors', '/moderation/queue', '/admin/feedback'];
  recording = true;
  for (let round = 0; round < ROUNDS; round++) {
    for (const m of ms) {
      for (const url of memberRoutes) await call(m.id, 'GET', url);
      const feed = (await call(m.id, 'GET', '/feed')) as { posts?: { id: string; author?: { id?: string } }[] } | null;
      const post = feed?.posts?.[round % Math.max(1, feed.posts.length)];
      if (post) {
        await call(m.id, 'GET', `/posts/${post.id}`);
        await call(m.id, 'GET', `/posts/${post.id}/comments`);
        await call(m.id, 'GET', `/posts/${post.id}/prayers`);
        await call(m.id, 'POST', `/posts/${post.id}/praying-now`, { durationSeconds: 30 });
      }
      const other = ms[(ms.indexOf(m) + 7) % ms.length]!.id;
      await call(m.id, 'GET', `/people/${other}`);
      await buildDigest(db, m.id);
    }
    for (const url of adminRoutes) await call(admin, 'GET', url);
    await findProblems(db);
  }
  recording = false;
  await app.close();
}

// "select ... where id = $1" and the same text are one query; numbers in literals stay.
const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

interface Row {
  text: string;
  calls: number;
  totalMs: number;
  meanMs: number;
  sample: unknown[];
}

async function explain(r: Row) {
  const client = await db.connect();
  try {
    await client.query('begin');
    const { rows } = await original.call(client, `explain (analyze, buffers, format json) ${r.text}`, r.sample) as { rows: { 'QUERY PLAN': unknown }[] };
    await client.query('rollback');
    const plan = (rows[0]!['QUERY PLAN'] as { Plan: PlanNode; 'Execution Time': number }[])[0]!;
    return { plan, seqScans: seqScans(plan.Plan), text: await textPlan(r) };
  } catch (e) {
    await client.query('rollback').catch(() => undefined);
    return { error: (e as Error).message };
  } finally {
    client.release();
  }
}

interface PlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  'Actual Rows'?: number;
  'Actual Loops'?: number;
  'Rows Removed by Filter'?: number;
  Plans?: PlanNode[];
}
function seqScans(n: PlanNode, out: string[] = []): string[] {
  if (n['Node Type'] === 'Seq Scan' && n['Relation Name']) {
    const removed = (n['Rows Removed by Filter'] ?? 0) * (n['Actual Loops'] ?? 1);
    out.push(`${n['Relation Name']} (${removed} rows filtered out${(n['Actual Loops'] ?? 1) > 1 ? `, ${n['Actual Loops']} loops` : ''})`);
  }
  for (const c of n.Plans ?? []) seqScans(c, out);
  return out;
}
async function textPlan(r: Row) {
  const client = await db.connect();
  try {
    await client.query('begin');
    const { rows } = await original.call(client, `explain (analyze, buffers off, costs off, timing off, summary on) ${r.text}`, r.sample) as { rows: { 'QUERY PLAN': string }[] };
    await client.query('rollback');
    return rows.map((x) => x['QUERY PLAN']).join('\n');
  } finally {
    client.release();
  }
}

await seed();
console.log(`Driving the API: ${ROUNDS} rounds × 50 members × ${22 + 4} requests, plus admin screens...`);
await drive();

const groups = new Map<string, Row>();
for (const s of seen) {
  const key = normalize(s.text);
  const g = groups.get(key) ?? { text: s.text, calls: 0, totalMs: 0, meanMs: 0, sample: s.values };
  g.calls++;
  g.totalMs += s.ms;
  groups.set(key, g);
}
const top = [...groups.values()].map((g) => ({ ...g, meanMs: g.totalMs / g.calls })).sort((a, b) => b.totalMs - a.totalMs).slice(0, 20);

const lines: string[] = [
  '# Query audit results',
  '',
  `Generated by \`npm run query-audit\` on ${new Date().toISOString().slice(0, 10)}: ${MEMBERS} seeded members (5 requests each, 20 prayers and 2 comments per request, 30 follows, 60 notifications, 500 conversations of 20 messages), ${seen.length} statements from ${groups.size} distinct queries. Times are from a local machine; compare them with each other, not with production.`,
  '',
  '| # | Calls | Total ms | Mean ms | Plan time ms | Sequential scans | Query |',
  '|---|---|---|---|---|---|---|',
];
const details: string[] = [];
for (const [i, r] of top.entries()) {
  const e = await explain(r);
  const first = normalize(r.text).slice(0, 90).replace(/[\\|]/g, (c) => `\\${c}`);
  if ('error' in e) {
    lines.push(`| ${i + 1} | ${r.calls} | ${r.totalMs.toFixed(0)} | ${r.meanMs.toFixed(2)} | n/a | n/a | \`${first}…\` |`);
    details.push(`## ${i + 1}\n\n\`\`\`sql\n${r.text.trim()}\n\`\`\`\n\nEXPLAIN failed: ${e.error}\n`);
    continue;
  }
  lines.push(
    `| ${i + 1} | ${r.calls} | ${r.totalMs.toFixed(0)} | ${r.meanMs.toFixed(2)} | ${e.plan['Execution Time'].toFixed(2)} | ${e.seqScans.join(', ') || 'none'} | \`${first}…\` |`,
  );
  details.push(`## ${i + 1}\n\n\`\`\`sql\n${r.text.trim()}\n\`\`\`\n\n\`\`\`\n${e.text}\n\`\`\`\n`);
}
const slowest = [...groups.values()].map((g) => ({ ...g, meanMs: g.totalMs / g.calls })).sort((a, b) => b.meanMs - a.meanMs).slice(0, 5);
lines.push('', '## Slowest per call', '', '| Mean ms | Calls | Query |', '|---|---|---|');
for (const r of slowest) lines.push(`| ${r.meanMs.toFixed(2)} | ${r.calls} | \`${normalize(r.text).slice(0, 90).replace(/[\\|]/g, (c) => `\\${c}`)}…\` |`);
lines.push('', '## Routes driven', '', ...SEEN_ROUTES.map((r) => `- ${r}`), '', '# Plans', '', ...details);
const out = fileURLToPath(new URL('../../../../docs/QUERY_AUDIT_RESULTS.md', import.meta.url));
writeFileSync(out, lines.join('\n') + '\n');
console.log(lines.slice(4, 26).join('\n'));
console.log(lines.slice(lines.indexOf('## Slowest per call'), lines.indexOf('## Routes driven')).join('\n'));
console.log(`\nWrote ${out}`);

if (!keep) await removeSeed();
await db.end();
process.exit(0);
