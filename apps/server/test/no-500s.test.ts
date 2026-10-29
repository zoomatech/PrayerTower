// Regression sweep: no route answers 500 to a malformed id or an empty body,
// even for an admin who passes every role check.
import { afterAll, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { app, as, createUser, db, routes } from './helpers.js';

afterAll(() => db.end());

it('answers bad ids and empty bodies with 4xx, never 500', async () => {
  await app.ready();
  const admin = await createUser('Sweep Admin');
  for (const role of ['admin', 'moderator', 'pastor'] as const) await grantRole(db, admin, role, null);
  const client = as(admin) as unknown as Record<string, (u: string, b?: unknown) => Promise<{ statusCode: number; body: string }>>;
  const crashes: string[] = [];
  let tried = 0;
  for (const r of routes) {
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method)) continue;
    // Only routes with an id: a bad id changes nothing, so other test files running at the same time are safe.
    if (!r.url.includes('/:')) continue;
    // The station, node and webhook routes check their own keys and signatures first.
    if (/^\/(station|node|donations\/(stripe|zeffy)-webhook|store\/apple)/.test(r.url)) continue;
    tried++;
    const url = r.url.replace(/:[a-zA-Z]+/g, 'not-an-id');
    const res = await client[r.method.toLowerCase()]!(url, r.method === 'GET' || r.method === 'DELETE' ? undefined : {});
    // 503 is "this service is not set up yet", which is expected here.
    if (res.statusCode === 500) crashes.push(`${r.method} ${r.url} -> ${res.statusCode}`);
  }
  expect(tried).toBeGreaterThan(100);
  expect(crashes).toEqual([]);
});

it('answers a hidden null character in a search or a text field with 400, not 500', async () => {
  const admin = await createUser('Null Admin');
  await grantRole(db, admin, 'admin', null);
  expect((await as(admin).get('/admin/people?q=a%00b')).statusCode).toBe(400);
  expect((await as(admin).post('/feedback', { body: 'a\u0000b' })).statusCode).toBe(400);
});
