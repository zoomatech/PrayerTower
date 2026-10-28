import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as tokens from '../src/modules/tokens/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

// Tests share the dev database: close the pools they open.
afterAll(async () => {
  await db.query(`update public.token_pools set closed_at = now() where closed_at is null and name in ('Field of Faith', 'Families', 'Named pool')`);
  await db.end();
});

async function withTokens(name: string, amount: number) {
  const id = await createUser(name);
  if (amount) await tokens.earn(db, id, amount, `t:${id}:seed`, 'test');
  return id;
}

describe('donated token pools', () => {
  it('lets a donor fund a pool that others draw from, once per request, with the donor anonymous by default', async () => {
    const donor = await withTokens('Barnabas Donor', 100);
    const create = await as(donor).post('/token-pools', { name: 'Field of Faith', purpose: 'For anyone who needs it.', amount: 12, idempotencyKey: 'p1' });
    expect(create.statusCode).toBe(201);
    expect(create.json().balance).toBe(88);
    const poolId = create.json().id;
    // Retrying the same create does not make a second pool.
    expect((await as(donor).post('/token-pools', { name: 'Field of Faith', amount: 12, idempotencyKey: 'p1' })).json().id).toBe(poolId);

    const poster = await createUser('Dorcas');
    const post = await newRequest(poster, 'Pray for the widows I sew for.');
    const member = await createUser('Silas');
    const listRes = await as(member).get(`/token-pools?postId=${post.id}`);
    if (listRes.statusCode !== 200) throw new Error(listRes.body);
    const listed = listRes.json().pools.find((p: { id: string }) => p.id === poolId);
    expect(listed).toMatchObject({ name: 'Field of Faith', donor: null, drawAmount: 5, balance: 12, blockedReason: null, isMine: false });

    const drawn = await as(member).post(`/token-pools/${poolId}/draw`, { postId: post.id });
    expect(drawn.json()).toEqual({ amount: 5, reach: 5, poolBalance: 7 });
    const again = await as(member).post(`/token-pools/${poolId}/draw`, { postId: post.id });
    expect(again.statusCode).toBe(409);
    expect(again.json().message).toMatch(/already used this pool/);
    // The poster can't draw for their own request.
    expect((await as(poster).post(`/token-pools/${poolId}/draw`, { postId: post.id })).json().message).toMatch(/other people/);

    // Open Circle members never see a faith pool, and it never reaches their requests.
    const circle = await createUser('Circle Pool Member');
    await db.query('delete from public.community_memberships where user_id = $1', [circle]);
    await db.query(
      `insert into public.community_memberships (community_id, user_id, is_primary) select id, $1, true from public.communities where slug = 'open-circle'`,
      [circle],
    );
    expect((await as(circle).get('/token-pools')).json().pools.some((p: { id: string }) => p.id === poolId)).toBe(false);
    const circlePost = (await db.query<{ id: string }>(
      `insert into public.posts (user_id, post_type, body, community_id) select $1, 'prayer_request', 'Moving house', id from public.communities where slug = 'open-circle' returning id`,
      [circle],
    )).rows[0]!;
    expect((await as(member).post(`/token-pools/${poolId}/draw`, { postId: circlePost.id })).statusCode).toBe(404);
  });

  it('enforces the daily limit, the realm, and an empty pool', async () => {
    const donor = await withTokens('Lydia Donor', 20);
    const poolId = (await as(donor).post('/token-pools', { name: 'Families', realm: 'family', drawAmount: 4, amount: 6, idempotencyKey: 'p2' })).json().id;
    const poster = await createUser('Poster');
    const family = await newRequest(poster, 'Pray for my family.', { realm: 'family' });
    const family2 = await newRequest(poster, 'Pray for my cousins.', { realm: 'family' });
    const world = await newRequest(poster, 'Pray for the world.', { realm: 'world' });
    const a = await createUser('Member A');
    const b = await createUser('Member B');
    expect((await as(a).post(`/token-pools/${poolId}/draw`, { postId: world.id })).json().message).toMatch(/different kind/);
    expect((await as(a).post(`/token-pools/${poolId}/draw`, { postId: family.id })).statusCode).toBe(200);
    expect((await as(a).post(`/token-pools/${poolId}/draw`, { postId: family2.id })).json().message).toMatch(/as often as it allows today/);
    expect((await as(b).post(`/token-pools/${poolId}/draw`, { postId: family.id })).json().message).toMatch(/empty/);
  });

  it('refuses links, lets only the donor add, and returns what is left when closed', async () => {
    const donor = await withTokens('Joanna Donor', 50);
    expect((await as(donor).post('/token-pools', { name: 'Visit shop.com', amount: 5, idempotencyKey: 'ad' })).statusCode).toBe(400);
    const res = await as(donor).post('/token-pools', { name: 'Named pool', showDonor: true, amount: 10, idempotencyKey: 'p3' });
    const poolId = res.json().id;
    const other = await withTokens('Other', 10);
    expect((await as(other).post(`/token-pools/${poolId}/fund`, { amount: 1, idempotencyKey: 'f' })).statusCode).toBe(403);
    expect((await as(donor).post(`/token-pools/${poolId}/fund`, { amount: 5, idempotencyKey: 'f' })).json()).toEqual({ poolBalance: 15, balance: 35 });
    expect((await as(other).get('/token-pools')).json().pools.find((p: { id: string }) => p.id === poolId).donor).toBe('Joanna Donor');

    expect((await as(other).post(`/token-pools/${poolId}/close`)).statusCode).toBe(403);
    const mod = await createUser('Pool Mod');
    await grantRole(db, mod, 'moderator', null);
    expect((await as(mod).post(`/token-pools/${poolId}/close`)).statusCode).toBe(200);
    expect(await tokens.balanceOf(db, donor)).toBe(50);
    expect((await as(other).get('/token-pools')).json().pools.some((p: { id: string }) => p.id === poolId)).toBe(false);
    const mine = (await as(donor).get('/me/token-pools')).json().pools;
    expect(mine.find((p: { id: string }) => p.id === poolId)).toMatchObject({ open: false, balance: 0 });
  });
});
