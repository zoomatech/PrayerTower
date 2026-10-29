// Encouragement partners: opt-in pairs for 30 days who check in on each other; either
// one leaves quietly; never across a block or with the same person twice. Off by default.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as notebook from '../src/modules/notebook/index.js';
import { as, createUser, db } from './helpers.js';

const on = (v: boolean) => db.query('update public.practice_settings set partners_enabled = $1', [v]);
const notices = async (userId: string) => (await db.query<{ title: string; body: string }>(`select title, body from public.notifications where user_id = $1 and kind = 'partner' order by created_at`, [userId])).rows;

beforeAll(async () => {
  await on(false);
  await db.query('delete from public.partner_pool');
});
afterAll(async () => {
  await on(false);
  await db.query('delete from public.partner_pool');
  await db.end();
});

describe('Encouragement partners', () => {
  it('is off by default', async () => {
    expect((await notebook.features(db)).partners).toBe(false);
    const u = await createUser('Partner Off');
    expect((await as(u).get('/me/partner')).json()).toEqual({ enabled: false });
    expect((await as(u).post('/me/partner/join', { agree: true })).statusCode).toBe(400);
  });

  it('pairs two members who opted in, for 30 days, and they check in once a day', async () => {
    await on(true);
    const [a, b] = [await createUser('Partner A'), await createUser('Partner B')];
    expect((await as(a).post('/me/partner/join', {})).statusCode).toBe(400);
    expect((await as(a).post('/me/partner/join', { agree: true })).json().status).toBe('waiting');
    const paired = (await as(b).post('/me/partner/join', { agree: true })).json();
    expect(paired).toMatchObject({ status: 'paired', partner: { displayName: 'Partner A' }, canCheckIn: true });
    expect(Math.round((Date.parse(paired.endsAt) - Date.now()) / 86_400_000)).toBe(30);
    expect((await notices(a))[0]!.title).toBe('You have an encouragement partner');

    const after = (await as(b).post('/me/partner/check-in', { mood: 'hard', note: 'Long week.' })).json();
    expect(after).toMatchObject({ canCheckIn: false, checkins: [{ mine: true, mood: 'hard', note: 'Long week.' }] });
    expect((await as(b).post('/me/partner/check-in', { mood: 'good' })).statusCode).toBe(400);
    expect((await notices(a)).at(-1)!.body).toBe('Partner B is having a hard day. "Long week." A kind word would mean a lot.');
    expect((await as(a).get('/me/partner')).json().checkins[0]).toMatchObject({ mine: false, mood: 'hard' });
  });

  it('either one leaves quietly, and the same two are never paired again', async () => {
    await on(true);
    const [a, b] = [await createUser('Leave A'), await createUser('Leave B')];
    await as(a).post('/me/partner/join', { agree: true });
    await as(b).post('/me/partner/join', { agree: true });
    const before = (await notices(a)).length;
    expect((await as(b).post('/me/partner/leave')).json().status).toBe('none');
    expect((await as(a).get('/me/partner')).json().status).toBe('none');
    expect((await notices(a)).length).toBe(before);
    await as(a).post('/me/partner/join', { agree: true });
    expect((await as(b).post('/me/partner/join', { agree: true })).json().status).toBe('waiting');
    await as(a).post('/me/partner/leave');
    await as(b).post('/me/partner/leave');
  });

  it('never pairs across a block', async () => {
    await on(true);
    const [a, b] = [await createUser('Block A'), await createUser('Block B')];
    await db.query('insert into public.user_blocks (user_id, blocked_id) values ($1, $2)', [a, b]);
    await as(a).post('/me/partner/join', { agree: true });
    expect((await as(b).post('/me/partner/join', { agree: true })).json().status).toBe('waiting');
  });
});
