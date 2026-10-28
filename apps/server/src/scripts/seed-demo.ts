// Demo data for a LOCAL database only: a handful of clearly labeled demo
// members with requests, prayers, a promise, a conversation, a group, an event
// and a care request, so the app can be shown and tested end to end.
//
//   npm run seed:demo            add the demo members (skips if they exist)
//   npm run seed:demo -- --reset remove the demo members and everything they made, then add them again
//
// It refuses to run unless both DATABASE_URL and SUPABASE_URL point at this
// machine. Real pilot content comes from real people (decision 2026-09-19);
// none of this may reach a shared or production database.
import { buildApp } from '../app.js';
import { loadConfig, loadDotEnv } from '../config.js';
import { createPool } from '../db.js';
import { grantRole } from '../modules/accounts/index.js';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const DEMO_DOMAIN = 'demo.prayertower.local';

export function isLocal(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

loadDotEnv();
const config = loadConfig();
if (!isLocal(config.DATABASE_URL) || !isLocal(config.SUPABASE_URL)) {
  console.error('seed:demo only runs against a local database (127.0.0.1 or localhost). Nothing was changed.');
  process.exit(1);
}
if (!config.SUPABASE_SECRET_KEY) {
  console.error('Set SUPABASE_SECRET_KEY (from `npx supabase status -o env`) so demo members can sign in.');
  process.exit(1);
}

const password = process.env.DEMO_PASSWORD || 'praying-demo-1';
const db = createPool(config.DATABASE_URL);
const authUrl = `${config.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin/users`;
const authHeaders = { apikey: config.SUPABASE_SECRET_KEY, authorization: `Bearer ${config.SUPABASE_SECRET_KEY}`, 'content-type': 'application/json' };

const existing = await db.query<{ id: string }>(`select id from auth.users where email like $1`, [`%@${DEMO_DOMAIN}`]);
if (existing.rows.length && !process.argv.includes('--reset')) {
  console.log(`Demo members already exist (${existing.rows.length}). Use --reset to recreate them.`);
  await db.end();
  process.exit(0);
}
for (const { id } of existing.rows) {
  const r = await fetch(`${authUrl}/${id}`, { method: 'DELETE', headers: authHeaders });
  if (!r.ok) throw new Error(`could not remove demo member ${id}: ${await r.text()}`);
}

// New-member limits would stop brand-new demo members from messaging; pause them while seeding.
const { rows: limits } = await db.query<{ on: boolean }>('select new_member_limits_enabled as on from public.safety_settings');
await db.query('update public.safety_settings set new_member_limits_enabled = false');

// Requests go through the real API in-process, so every rule and moderation step applies.
const app = buildApp({ db, verifyToken: async (t) => t.replace(/^seed:/, '') });
async function call<T = Record<string, unknown>>(userId: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object): Promise<T> {
  const res = await app.inject({ method, url, headers: { authorization: `Bearer seed:${userId}` }, ...(payload ? { payload } : {}) });
  if (res.statusCode >= 400) {
    await db.query('update public.safety_settings set new_member_limits_enabled = $1', [limits[0]?.on ?? true]);
    throw new Error(`${method} ${url}: ${res.body}`);
  }
  return res.json() as T;
}

async function member(key: string, name: string) {
  const r = await fetch(authUrl, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ email: `${key}@${DEMO_DOMAIN}`, password, email_confirm: true, user_metadata: { display_name: name } }),
  });
  const u = (await r.json()) as { id?: string; msg?: string };
  if (!u.id) throw new Error(`could not create ${key}: ${JSON.stringify(u)}`);
  // Seasoned members, so new-member limits don't block the demo.
  await db.query(`update public.profiles set display_name = $2, onboarded_at = now(), created_at = now() - interval '60 days' where id = $1`, [u.id, name]);
  return u.id;
}

const ids = {
  admin: await member('admin', 'Demo Admin'),
  carol: await member('carol', 'Demo Carol'),
  ethel: await member('ethel', 'Demo Ethel'),
  james: await member('james', 'Demo James'),
  ruth: await member('ruth', 'Demo Ruth'),
  pastor: await member('pastor', 'Demo Pastor'),
};
await grantRole(db, ids.admin, 'admin', null);
await grantRole(db, ids.admin, 'moderator', null);
await grantRole(db, ids.pastor, 'pastor_counselor', null);
await grantRole(db, ids.pastor, 'prayer_partner', null);

type Post = { post: { id: string } };
const request = (u: string, body: string, extra: object = {}) => call<Post>(u, 'POST', '/posts', { postType: 'prayer_request', body: `[Demo] ${body}`, ...extra });

const mother = await request(ids.carol, 'Please pray for my mother, who starts treatment on Monday.');
const job = await request(ids.james, 'Pray for wisdom as I look for a new job.');
const roof = await request(ids.ruth, 'Our church needs a fair roofer before winter.');
const family = await request(ids.ethel, 'Pray for peace in our family over the holidays.', { isAnonymous: true });
await call(ids.carol, 'POST', '/posts', { postType: 'praise', body: '[Demo] Thank you all for praying. My sister is home from the hospital.' });

// Everyone prays for everyone else's requests.
const requests = [
  [ids.carol, mother],
  [ids.james, job],
  [ids.ruth, roof],
  [ids.ethel, family],
] as const;
for (const prayer of [ids.carol, ids.ethel, ids.james, ids.ruth]) {
  for (const [owner, post] of requests) if (owner !== prayer) await call(prayer, 'POST', `/posts/${post.post.id}/praying-now`, { durationSeconds: 45 });
}
await call(ids.ethel, 'POST', `/posts/${mother.post.id}/commitments`, { frequency: 'daily', durationDays: 7, vowText: 'I will pray for your mother every morning this week.' });
await call(ids.ruth, 'POST', `/posts/${mother.post.id}/comments`, { body: '[Demo] Praying for strength and good news.' });
await call(ids.carol, 'POST', `/posts/${roof.post.id}/comments`, { body: '[Demo] Praying you find the right people.' });

const thread = await call<{ conversationId: string }>(ids.ethel, 'POST', `/posts/${mother.post.id}/messages`, {
  body: '[Demo] I am praying for your mother every morning this week.',
});
await call(ids.carol, 'POST', `/conversations/${thread.conversationId}/accept`);
await call(ids.carol, 'POST', `/conversations/${thread.conversationId}/messages`, { body: '[Demo] Thank you, that means a lot.' });

await call(ids.ruth, 'POST', '/conversations/groups', {
  title: '[Demo] Morning prayer circle',
  topic: 'We pray together before work.',
  isPublic: true,
  memberIds: [ids.carol, ids.james],
});

const saturday = new Date();
saturday.setDate(saturday.getDate() + (((6 - saturday.getDay() + 7) % 7) || 7));
saturday.setHours(9, 0, 0, 0);
const event = await call<{ event: { id: string } }>(ids.ruth, 'POST', '/events', {
  kind: 'meetup',
  title: '[Demo] Saturday prayer walk',
  description: 'We walk the neighborhood and pray for each home.',
  location: 'Riverside Park, north gate',
  startsAt: saturday.toISOString(),
});
await call(ids.carol, 'PUT', `/events/${event.event.id}/rsvp`, { status: 'going' });

await call(ids.james, 'POST', '/care-requests', { kind: 'pray_with_me', body: '[Demo] I would like someone to pray with me about my job search.' });

await db.query('update public.safety_settings set new_member_limits_enabled = $1', [limits[0]?.on ?? true]);
console.log(`Demo data added. Sign in as any of these with the password "${password}":`);
for (const key of Object.keys(ids)) console.log(`  ${key}@${DEMO_DOMAIN}`);
await app.close();
await db.end();
