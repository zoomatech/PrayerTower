// When either person has blocked the other, neither can spend on the other's requests:
// amplify with tokens, draw from a pool, or schedule a gift.
import { afterAll, describe, expect, it } from 'vitest';
import * as tokens from '../src/modules/tokens/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(async () => {
  await db.query(`update public.token_pools set closed_at = now() where closed_at is null and name = 'Blocked pool'`);
  await db.end();
});

const soon = () => new Date(Date.now() + 3600_000).toISOString();

describe('spending on a blocked person’s request', () => {
  it('is refused like any request they cannot see', async () => {
    const poster = await createUser('Blocking Poster');
    const giver = await createUser('Blocked Giver');
    const donor = await createUser('Blocked Pool Donor');
    await tokens.earn(db, giver, 20, `t:${giver}:seed`, 'test');
    await tokens.earn(db, donor, 20, `t:${donor}:seed`, 'test');
    const post = await newRequest(poster, 'Pray for my brother, he lost his job this week.');
    const poolId = (await as(donor).post('/token-pools', { name: 'Blocked pool', amount: 12, idempotencyKey: `bp:${donor}` })).json().id;

    expect((await as(poster).put(`/people/${giver}/block`)).statusCode).toBe(200);
    expect((await as(giver).post(`/posts/${post.id}/boost`, { amount: 1, idempotencyKey: 'blk1' })).statusCode).toBe(404);
    expect((await as(giver).post(`/token-pools/${poolId}/draw`, { postId: post.id })).statusCode).toBe(404);
    expect((await as(giver).post(`/posts/${post.id}/scheduled-spends`, { amount: 1, runAt: soon() })).statusCode).toBe(404);
    expect(await tokens.balanceOf(db, giver)).toBe(20);

    // Once unblocked, the same gifts go through.
    expect((await as(poster).delete(`/people/${giver}/block`)).statusCode).toBe(200);
    expect((await as(giver).post(`/posts/${post.id}/boost`, { amount: 1, idempotencyKey: 'blk1' })).statusCode).toBe(200);
    expect((await as(giver).post(`/token-pools/${poolId}/draw`, { postId: post.id })).statusCode).toBe(200);
    expect((await as(giver).post(`/posts/${post.id}/scheduled-spends`, { amount: 1, runAt: soon() })).statusCode).toBe(201);
  });
});
