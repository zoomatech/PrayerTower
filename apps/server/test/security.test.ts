// Pilot security checks: the database stays closed to Supabase's client roles,
// and every member endpoint refuses callers who aren't signed in.
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { app, as, createUser, db, routes } from './helpers.js';

afterAll(() => db.end());

describe('database lock-down', () => {
  it('has RLS on every public table and no policies', async () => {
    const { rows } = await db.query(`select tablename from pg_tables where schemaname = 'public' and not rowsecurity`);
    expect(rows).toEqual([]);
    const { rows: policies } = await db.query(`select tablename, policyname from pg_policies where schemaname = 'public'`);
    expect(policies).toEqual([]);
  });

  it('gives anon and authenticated no table, sequence or function access', async () => {
    const { rows } = await db.query(
      `select 'table ' || c.relname as what from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
          and (has_table_privilege('anon', c.oid, 'select,insert,update,delete')
            or has_table_privilege('authenticated', c.oid, 'select,insert,update,delete'))
       union all
       select 'sequence ' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'S'
          and (has_sequence_privilege('anon', c.oid, 'usage') or has_sequence_privilege('authenticated', c.oid, 'usage'))
       union all
       select 'function ' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`,
    );
    expect(rows).toEqual([]);
  });

  it('keeps the media bucket private', async () => {
    const { rows } = await db.query(`select id from storage.buckets where public`);
    expect(rows).toEqual([]);
  });
});

describe('endpoint auth', () => {
  it('refuses every route without a sign-in, except health and the station key routes', async () => {
    const open = new Set([
      'GET /health',
      // Uptime monitors: only ok and problem names (worker_down, jobs_overdue).
      'GET /health/ready',
      'POST /station/claim',
      'POST /station/radio-prayers/:id/result',
      'GET /account-deletion',
      'POST /account-deletion/requests',
      'GET /',
      'GET /support',
      'GET /privacy',
      'GET /post/:id',
      'GET /.well-known/apple-app-site-association',
      'GET /.well-known/assetlinks.json',
      'GET /terms',
      'GET /signup-config',
      // The Common Prayer Fund's public report (404 while switched off; names no one).
      'GET /common-prayer-fund/report',
      'GET /fund',
      // Sponsor thanks (404 while switched off; names only sponsors staff added).
      'GET /sponsors/list',
      'GET /sponsors',
      // Giving: whether it's on, the public summary (names no one), and Stripe's signed webhook.
      'GET /donations/info',
      'GET /donations/summary',
      'POST /donations/stripe-webhook',
      'POST /donations/zeffy-webhook', // checks its own ?token=
      // App Store Server Notifications: Apple's signature on the payload is the check.
      'POST /store/apple/notifications',
      // A practice live room's page: fixed text, no data; the room name is long and random.
      'GET /live/practice/:name',
      // The same public pages in Spanish.
      'GET /es',
      'GET /es/',
      'GET /es/support',
      'GET /es/privacy',
      'GET /es/terms',
      'GET /es/account-deletion',
      // Open Circle's public pages under the Prayer Tower domain.
      'GET /open-circle',
      'GET /open-circle/',
      'GET /open-circle/support',
      'GET /open-circle/privacy',
      'GET /open-circle/terms',
      'GET /open-circle/account-deletion',
      // The ad-free promise (404 while switched off).
      'GET /promise',
      'GET /open-circle/promise',
      // The radio listening page (404 while switched off; decoding happens in the browser).
      'GET /listen',
      // A listener's receipt: prayer fingerprints only, rate limited (404 while switched off).
      'POST /listen/heard',
      // Listener mode: whether the sign-in screen offers listening (two switches, nothing else).
      'GET /listen/config',
      // A listener's "I'm praying too": fingerprints only, an anonymous count (404 while switched off).
      'POST /listen/praying',
      // Prayers on the air: counts only (404 while switched off).
      'GET /on-the-air',
      'GET /open-circle/on-the-air',
      'GET /open-circle/listen',
      // Why we run on gifts, not ads: the web page and the same words for the app (404 while switched off).
      'GET /why-donations',
      'GET /open-circle/why-donations',
      'GET /why-gifts',
      // The waitlist page and joining it (404 while switched off; joining is rate limited).
      'GET /waitlist',
      'GET /open-circle/waitlist',
      'POST /waitlist/join',
      // Public podcast feeds for podcast apps (404 while switched off).
      'GET /podcasts/:slug/feed.xml',
      // Guest prayer and prayer-chain pages: an unguessable link each, 404 while switched off.
      'GET /pray/:token',
      'POST /pray/:token',
      'GET /circle/:token',
      'POST /circle/:token',
      'GET /chain/:token',
      'POST /chain/:token',
      // Cross-posting: the Meta sign-in return (one-time state) and the Threads webhook check (verify token).
      'GET /crosspost/:provider/callback',
      'GET /crosspost/threads/webhook',
      // Sharing with consent: the share card the author chose (a 404 otherwise).
      'GET /card/:token',
    ]);
    await app.ready();
    expect(routes.length).toBeGreaterThan(100);
    const leaks: string[] = [];
    for (const r of routes) {
      if (open.has(`${r.method} ${r.url}`) || r.method === 'OPTIONS') continue;
      const url = r.url.replace(/:[a-zA-Z]+/g, '00000000-0000-0000-0000-000000000000');
      const res = await app.inject({ method: r.method as 'GET', url, payload: r.method === 'GET' || r.method === 'DELETE' ? undefined : {} });
      if (res.statusCode !== 401) leaks.push(`${r.method} ${r.url} -> ${res.statusCode}`);
    }
    expect(leaks).toEqual([]);
  });
});

describe('staff-only endpoints', () => {
  it('turn a plain member away from admin, moderation and Witness team routes', async () => {
    await app.ready();
    const member = await createUser('Plain Member');
    const zero = '00000000-0000-0000-0000-000000000000';
    const staffOnly: [string, string][] = [];
    for (const r of routes) {
      // Members may check a draft and appeal a decision on their own post.
      if (['/moderation/precheck', '/moderation/items/:id/appeal'].includes(r.url)) continue;
      if (/^\/(admin|witness|moderation|staff|station-admin|oncall)\b/.test(r.url)) staffOnly.push([r.method, r.url]);
    }
    expect(staffOnly.length).toBeGreaterThan(35);
    const leaks: string[] = [];
    for (const [method, path] of staffOnly) {
      const url = path.replace(/:[a-zA-Z]+/g, zero);
      const client = as(member) as unknown as Record<string, (u: string, b?: unknown) => Promise<{ statusCode: number }>>;
      const res = await client[method.toLowerCase()]!(url, method === 'GET' || method === 'DELETE' ? undefined : {});
      // 403 is the role check; 400 would mean the body was checked before the role.
      if (res.statusCode !== 403) leaks.push(`${method} ${path} -> ${res.statusCode}`);
    }
    expect(leaks).toEqual([]);
  });
});

describe('media paths', () => {
  it("won't attach a file outside the member's own upload folder", async () => {
    const member = await createUser('Media Poster');
    for (const storagePath of [`${member}/../someone-else/photo.jpg`, `${member}/sub/11111111-1111-1111-1111-111111111111.jpg`, 'other/11111111-1111-1111-1111-111111111111.jpg']) {
      const res = await as(member).post('/posts', { postType: 'prayer_request', body: 'Pray for us', media: [{ kind: 'image', storagePath }] });
      expect(res.statusCode).toBe(400);
    }
  });
});

describe('rate limit', () => {
  it('slows a member who floods the API, without affecting others', async () => {
    const limited = buildApp({ db, verifyToken: async (t) => t.slice(5), rateLimitPerMinute: 3 });
    const [a, b] = [await createUser('Fast Tapper'), await createUser('Calm Reader')];
    const hit = (u: string) => limited.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer test:${u}` } });
    for (let i = 0; i < 3; i++) expect((await hit(a)).statusCode).toBe(200);
    expect((await hit(a)).statusCode).toBe(429);
    expect((await hit(b)).statusCode).toBe(200);
    await limited.close();
  });

  it('counts public pages per visitor behind a proxy, not per proxy', async () => {
    const limited = buildApp({ db, verifyToken: async (t) => t.slice(5), rateLimitPerMinute: 3, clientIpHeader: 'Fly-Client-IP' });
    const hit = (ip: string) => limited.inject({ method: 'POST', url: '/waitlist/join', headers: { 'fly-client-ip': ip }, payload: {} });
    for (let i = 0; i < 10; i++) expect((await hit('203.0.113.7')).statusCode).not.toBe(429);
    expect((await hit('203.0.113.7')).statusCode).toBe(429);
    expect((await hit('198.51.100.20')).statusCode).not.toBe(429);
    await limited.close();
  });

  it('uses one shared count when no proxy header is set', async () => {
    const limited = buildApp({ db, verifyToken: async (t) => t.slice(5), rateLimitPerMinute: 3 });
    const hit = (ip: string) => limited.inject({ method: 'POST', url: '/waitlist/join', headers: { 'fly-client-ip': ip }, payload: {} });
    for (let i = 0; i < 10; i++) await hit(`203.0.113.${i}`);
    expect((await hit('198.51.100.20')).statusCode).toBe(429);
    await limited.close();
  });
});
