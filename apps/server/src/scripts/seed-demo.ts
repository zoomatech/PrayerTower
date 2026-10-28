// Demo data for a LOCAL database only: a handful of clearly labeled demo
// members with requests, prayers, a promise, a conversation, a group, an event
// and a care request, so the app can be shown and tested end to end.
//
//   npm run seed:demo    add the demo members (skips if they already exist)
//   npm run seed:demo -- --edition open-circle
//                        the same for Open Circle (docs/OPEN_CIRCLE.md): it switches the
//                        Open Circle community on and adds its own members, in neutral words
//
// It refuses to run unless both DATABASE_URL and SUPABASE_URL point at this
// machine. Real pilot content comes from real people (decision 2026-09-19);
// none of this may reach a shared or production database.
import { runMigrations } from 'graphile-worker';
import { buildApp } from '../app.js';
import { loadConfig, loadDotEnv } from '../config.js';
import { createPool } from '../db.js';
import { grantRole } from '../modules/accounts/index.js';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const edition = process.argv[process.argv.indexOf('--edition') + 1];
const OPEN_CIRCLE = process.argv.includes('--edition') && edition === 'open-circle';
if (process.argv.includes('--edition') && !OPEN_CIRCLE) {
  console.error('The only other edition is open-circle.');
  process.exit(1);
}
const DEMO_DOMAIN = OPEN_CIRCLE ? 'demo.opencircle.local' : 'demo.prayertower.local';

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
if (existing.rows.length) {
  // The token ledger is append-only, so members who earned tokens can't be deleted; start from a clean database instead.
  console.log(`Demo members already exist (${existing.rows.length}). To start over: npm run db:reset, then npm run seed:demo.`);
  await db.end();
  process.exit(0);
}

// Posting queues jobs, so the job queue's tables must exist (a fresh `db reset` has none until the worker starts).
await runMigrations({ pgPool: db });

// New-member limits would stop brand-new demo members from messaging; pause them while seeding.
const { rows: limits } = await db.query<{ on: boolean }>('select new_member_limits_enabled as on from public.safety_settings');
await db.query('update public.safety_settings set new_member_limits_enabled = false');

// Requests go through the real API in-process, so every rule and moderation step applies.
const app = buildApp({ db, verifyToken: async (t) => t.replace(/^seed:/, '') });
async function call<T = Record<string, unknown>>(userId: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, payload?: object): Promise<T> {
  const res = await app.inject({ method, url, headers: { authorization: `Bearer seed:${userId}` }, ...(payload ? { payload } : {}) });
  if (res.statusCode >= 400) {
    await db.query('update public.safety_settings set new_member_limits_enabled = $1', [limits[0]?.on ?? true]);
    throw new Error(`${method} ${url}: ${res.body}`);
  }
  return res.json() as T;
}

async function member(key: string, name: string) {
  // Open Circle members join its community at sign-up, as the Open Circle app does.
  const metadata = { display_name: name, ...(OPEN_CIRCLE ? { community: 'open-circle' } : {}) };
  const r = await fetch(authUrl, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ email: `${key}@${DEMO_DOMAIN}`, password, email_confirm: true, user_metadata: metadata, app_metadata: { invite_exempt: true } }),
  });
  const u = (await r.json()) as { id?: string; msg?: string };
  if (!u.id) throw new Error(`could not create ${key}: ${JSON.stringify(u)}`);
  // Seasoned members, so new-member limits don't block the demo.
  await db.query(`update public.profiles set display_name = $2, onboarded_at = now(), created_at = now() - interval '60 days' where id = $1`, [u.id, name]);
  return u.id;
}

type Post = { post: { id: string } };
const ids = OPEN_CIRCLE ? await openCircleDemo() : await faithDemo();

async function faithDemo() {
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

  const request = (u: string, body: string, extra: object = {}) => call<Post>(u, 'POST', '/posts', { postType: 'prayer_request', body: `[Demo] ${body}`, ...extra });

  const mother = await request(ids.carol, 'Please pray for my mother, who starts treatment on Monday.');
  const job = await request(ids.james, 'Pray for wisdom as I look for a new job.');
  const roof = await request(ids.ruth, 'Our church needs a fair roofer before winter.');
  const family = await request(ids.ethel, 'Pray for peace in our family over the holidays.', { isAnonymous: true });
  const travel = await request(ids.james, 'Pray for safe travel as I drive to see my parents this weekend.');
  const grandson = await request(ids.ruth, 'Pray for my grandson as he starts at a new school.');
  const neighbor = await request(ids.carol, 'Pray for my neighbor, who lives alone and has been unwell.');
  await call(ids.carol, 'POST', '/posts', { postType: 'praise', body: '[Demo] Thank you all for praying. My sister is home from the hospital.' });

  // Everyone prays for everyone else's requests, enough to count as a settled member.
  const requests = [
    [ids.carol, mother],
    [ids.james, job],
    [ids.ruth, roof],
    [ids.ethel, family],
    [ids.james, travel],
    [ids.ruth, grandson],
    [ids.carol, neighbor],
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
  return ids;
}

/** Open Circle: its own members and content, in its neutral words (Request, Good News, Story, Thinking of You). */
async function openCircleDemo() {
  const admin = await member('admin', 'Demo Admin');
  await grantRole(db, admin, 'admin', null);
  await grantRole(db, admin, 'moderator', null);
  // Open Circle is off until an admin switches it on (Admin → Communities).
  await call(admin, 'PATCH', '/admin/communities/open-circle', { status: 'active' });
  const ids = {
    admin,
    maya: await member('maya', 'Demo Maya'),
    sam: await member('sam', 'Demo Sam'),
    lena: await member('lena', 'Demo Lena'),
    theo: await member('theo', 'Demo Theo'),
    mentor: await member('mentor', 'Demo Mentor'),
  };
  await grantRole(db, ids.mentor, 'pastor_counselor', null);
  await grantRole(db, ids.mentor, 'prayer_partner', null);

  const post = (u: string, postType: string, body: string, extra: object = {}) => call<Post>(u, 'POST', '/posts', { postType, body: `[Demo] ${body}`, ...extra });
  const request = (u: string, body: string, extra: object = {}) => post(u, 'prayer_request', body, extra);
  const dad = await request(ids.maya, 'My dad has his knee surgery on Monday. Good thoughts and a kind word would mean a lot.');
  const job = await request(ids.sam, "Three interviews this week for a new job. I'm nervous, so any encouragement helps.");
  const move = await request(ids.lena, 'We move across town on Saturday and could use a hand carrying boxes.');
  const lonely = await request(ids.theo, "It's been a lonely month since the move. Hoping to meet a few friendly people.", { isAnonymous: true });
  const drive = await request(ids.sam, 'Driving eight hours to see my parents this weekend. Wish me an easy trip.');
  const school = await request(ids.lena, 'My son starts at a new school tomorrow. Hoping he makes a friend on day one.');
  const neighbor = await request(ids.maya, "My neighbor lives alone and hasn't been well. Ideas for small ways to help?");
  await post(ids.maya, 'praise', 'Good news: my sister is home from the hospital. Thank you for all the kind messages.');
  await post(ids.theo, 'testimony', 'A stranger paid for my coffee today and left a note that said "You\'ve got this." I needed that.');

  // Everyone is thinking of everyone else's requests, enough to count as a settled member.
  const requests = [
    [ids.maya, dad],
    [ids.sam, job],
    [ids.lena, move],
    [ids.theo, lonely],
    [ids.sam, drive],
    [ids.lena, school],
    [ids.maya, neighbor],
  ] as const;
  for (const supporter of [ids.maya, ids.sam, ids.lena, ids.theo]) {
    for (const [owner, p] of requests) if (owner !== supporter) await call(supporter, 'POST', `/posts/${p.post.id}/praying-now`, { durationSeconds: 45 });
  }
  await call(ids.theo, 'POST', `/posts/${dad.post.id}/commitments`, { frequency: 'daily', durationDays: 7, vowText: "I'll check in with you every day this week." });
  await call(ids.lena, 'POST', `/posts/${dad.post.id}/comments`, { body: '[Demo] Sending you both strength. Tell us how it goes!' });
  await call(ids.maya, 'POST', `/posts/${move.post.id}/comments`, { body: "[Demo] I'm free Saturday morning and have a truck." });

  const thread = await call<{ conversationId: string }>(ids.theo, 'POST', `/posts/${dad.post.id}/messages`, {
    body: "[Demo] I'm thinking of your dad. My mom had the same surgery and was walking in a week.",
  });
  await call(ids.maya, 'POST', `/conversations/${thread.conversationId}/accept`);
  await call(ids.maya, 'POST', `/conversations/${thread.conversationId}/messages`, { body: '[Demo] Thank you, that really helps to hear.' });

  await call(ids.lena, 'POST', '/conversations/groups', {
    title: '[Demo] Morning walkers',
    topic: 'An early walk and a chat before work.',
    isPublic: true,
    memberIds: [ids.maya, ids.sam],
  });

  const saturday = new Date();
  saturday.setDate(saturday.getDate() + (((6 - saturday.getDay() + 7) % 7) || 7));
  saturday.setHours(9, 0, 0, 0);
  const event = await call<{ event: { id: string } }>(ids.lena, 'POST', '/events', {
    kind: 'meetup',
    title: '[Demo] Saturday park clean-up',
    description: 'Gloves and bags provided. Coffee after.',
    location: 'Riverside Park, north gate',
    startsAt: saturday.toISOString(),
  });
  await call(ids.maya, 'PUT', `/events/${event.event.id}/rsvp`, { status: 'going' });

  await call(ids.sam, 'POST', '/care-requests', { kind: 'pray_with_me', body: '[Demo] I would like someone to talk with about my job search.' });
  return ids;
}

await db.query('update public.safety_settings set new_member_limits_enabled = $1', [limits[0]?.on ?? true]);
console.log(`Demo data added. Sign in as any of these with the password "${password}":`);
for (const key of Object.keys(ids)) console.log(`  ${key}@${DEMO_DOMAIN}`);
await app.close();
await db.end();
