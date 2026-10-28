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
      'POST /station/claim',
      'POST /station/radio-prayers/:id/result',
      'GET /account-deletion',
      'POST /account-deletion/requests',
      'GET /',
      'GET /support',
      'GET /privacy',
      'GET /terms',
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
      if (/^\/(admin|witness|moderation\/(queue|appeals|activity-flags|items\/:id\/decision))/.test(r.url)) staffOnly.push([r.method, r.url]);
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
});
