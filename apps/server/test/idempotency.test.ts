// Offline replays: a POST sent again with the same Idempotency-Key is answered from the first try.
import { afterAll, expect, it } from 'vitest';
import { purge } from '../src/modules/retention/index.js';
import { app, createUser, db, newRequest } from './helpers.js';

afterAll(() => db.end());

const send = (userId: string, url: string, payload: object, key?: string) =>
  app.inject({ method: 'POST', url, payload, headers: { authorization: `Bearer test:${userId}`, ...(key ? { 'idempotency-key': key } : {}) } });

it('makes a replayed post once and gives back the first answer', async () => {
  const member = await createUser('Lydia');
  const body = { postType: 'prayer_request', body: 'Please pray for my sister, her train was cancelled.' };
  const first = await send(member, '/posts', body, 'key-lydia-0001');
  expect(first.statusCode).toBe(201);
  const again = await send(member, '/posts', body, 'key-lydia-0001');
  expect(again.statusCode).toBe(201);
  expect(again.headers['idempotent-replay']).toBe('true');
  expect(again.json().post.id).toBe(first.json().post.id);
  const { rows } = await db.query('select count(*)::int as n from public.posts where user_id = $1', [member]);
  expect(rows[0].n).toBe(1);
  // Another member's key is their own.
  const other = await createUser('Dorcas');
  expect((await send(other, '/posts', body, 'key-lydia-0001')).headers['idempotent-replay']).toBeUndefined();
});

it('records one Praying Now for a replay, and lets a refused try run again', async () => {
  const author = await createUser('Phoebe');
  const prayer = await createUser('Priscilla');
  const post = await newRequest(author);
  expect((await send(prayer, `/posts/${post.id}/praying-now`, {}, 'pray-key-0001')).statusCode).toBeLessThan(300);
  expect((await send(prayer, `/posts/${post.id}/praying-now`, {}, 'pray-key-0001')).headers['idempotent-replay']).toBe('true');
  const { rows } = await db.query("select count(*)::int as n from public.prayer_events where user_id = $1 and kind = 'praying_now'", [prayer]);
  expect(rows[0].n).toBe(1);

  // A refusal isn't kept: the key is free for the next try.
  const bad = await send(prayer, '/posts', { postType: 'prayer_request', body: '' }, 'retry-key-0001');
  expect(bad.statusCode).toBe(400);
  const good = await send(prayer, '/posts', { postType: 'prayer_request', body: 'Pray for rain on the farm.' }, 'retry-key-0001');
  expect(good.statusCode).toBe(201);
  expect(good.headers['idempotent-replay']).toBeUndefined();
});

it('refuses a bad key, a key reused for another route, and answers 503 while the first is running', async () => {
  const member = await createUser('Joanna');
  expect((await send(member, '/feedback', { body: 'hi' }, 'bad key!')).statusCode).toBe(400);
  expect((await send(member, '/feedback', { body: 'First note' }, 'reuse-key-001')).statusCode).toBeLessThan(300);
  expect((await send(member, '/posts', { postType: 'prayer_request', body: 'x' }, 'reuse-key-001')).statusCode).toBe(400);
  await db.query(`insert into public.request_keys (user_id, key, route) values ($1, 'running-key-01', 'POST /feedback')`, [member]);
  expect((await send(member, '/feedback', { body: 'Second note' }, 'running-key-01')).statusCode).toBe(503);
  // One that never finished frees itself after a minute.
  await db.query(`update public.request_keys set created_at = now() - interval '2 minutes' where key = 'running-key-01'`);
  expect((await send(member, '/feedback', { body: 'Second note' }, 'running-key-01')).statusCode).toBeLessThan(300);
});

it('forgets keys after a week', async () => {
  const member = await createUser('Tabitha');
  await db.query(`insert into public.request_keys (user_id, key, route, status, body, created_at) values ($1, 'old-key-0001', 'POST /feedback', 201, '{}', now() - interval '8 days')`, [member]);
  await purge(db, { removedDays: 0, notificationDays: 0, queueDays: 0 });
  const { rows } = await db.query(`select 1 from public.request_keys where user_id = $1`, [member]);
  expect(rows).toEqual([]);
});
