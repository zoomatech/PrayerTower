// Third bug hunt (tokens, radio queue, moderation), 2026-10-28.
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as tokens from '../src/modules/tokens/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(() => db.end());

describe('bug hunt 3', () => {
  it('refuses gifts to unknown or deleted members and across a block', async () => {
    const giver = await createUser('Hunt Giver');
    const gone = await createUser('Hunt Gone');
    const blocker = await createUser('Hunt Blocker');
    const friend = await createUser('Hunt Friend');
    await tokens.earn(db, giver, 10, `hunt-earn:${giver}`, 'test');
    const gift = (toUserId: string, key: string) => as(giver).post('/tokens/gift', { toUserId, amount: 1, idempotencyKey: key });

    expect((await gift(randomUUID(), 'h1')).statusCode).toBe(404);
    await db.query('update public.profiles set deleted_at = now() where id = $1', [gone]);
    expect((await gift(gone, 'h2')).statusCode).toBe(404);
    await as(blocker).put(`/people/${giver}/block`);
    expect((await gift(blocker, 'h3')).statusCode).toBe(404);
    expect((await gift(friend, 'h4')).statusCode).toBe(200);
    expect(await tokens.balanceOf(db, giver)).toBe(9); // nothing lost on the refused ones
  });

  it('lets a free radio prayer be sent again after one failed, and refuses sensitive requests up front', async () => {
    const poster = await createUser('Hunt Poster');
    const sender = await createUser('Hunt Sender');
    await tokens.updateSettings(db, { radio_funding: 'free' });
    const post = await newRequest(poster, 'Pray for the rescue crews.');
    const queued = await as(sender).post(`/posts/${post.id}/radio`, { idempotencyKey: 'hr-1' });
    const first = queued.json().radioPrayer;
    // A second tap while it's queued is the same prayer.
    expect((await as(sender).post(`/posts/${post.id}/radio`, { idempotencyKey: 'hr-2' })).json().radioPrayer.id).toBe(first.id);
    await db.query(`update public.radio_prayers set status = 'failed', error = 'station error' where id = $1`, [first.id]);
    const retried = await as(sender).post(`/posts/${post.id}/radio`, { idempotencyKey: 'hr-3' });
    const retry = retried.json().radioPrayer;
    expect(retry.id).not.toBe(first.id);
    expect(retry.status).toBe('queued');
    // Amplify is its own prayer, even after a plain one.
    const amplified = await as(sender).post(`/posts/${post.id}/radio`, { idempotencyKey: 'hr-5', amplify: true });
    expect(amplified.statusCode).toBe(201);
    expect(amplified.json().radioPrayer.repeats).toBeGreaterThan(1);

    const sensitive = await newRequest(poster, 'Graphic medical details.', { isSensitive: true });
    expect((await as(sender).post(`/posts/${sensitive.id}/radio`, { idempotencyKey: 'hr-4' })).statusCode).toBe(409);
    await tokens.updateSettings(db, { radio_funding: 'tokens' });
  });

  it("only claws back transfers to or from the member being decided about", async () => {
    const spammer = await createUser('Hunt Spammer');
    const a = await createUser('Hunt Bystander A');
    const b = await createUser('Hunt Bystander B');
    const mod = await createUser('Hunt Moderator');
    await grantRole(db, mod, 'moderator', null);
    await tokens.earn(db, a, 5, `hunt-earn:${a}`, 'test');
    await tokens.earn(db, b, 5, `hunt-earn:${b}`, 'test');
    const unrelated = await tokens.gift(db, a, b, 2, 'hunt-unrelated');
    const toSpammer = await tokens.gift(db, a, spammer, 1, 'hunt-to-spammer');
    const post = await newRequest(spammer, 'Buy my supplements at example dot com');
    const { reportId: itemId } = (await as(a).post('/reports', { targetType: 'post', targetId: post.id, reason: 'ad' })).json();

    const bad = await as(mod).post(`/moderation/items/${itemId}/decision`, { action: 'remove', rule: 'ads', clawbackTransferIds: [unrelated.id] });
    expect(bad.statusCode).toBe(400);
    expect(await tokens.balanceOf(db, b)).toBe(7);
    const ok = await as(mod).post(`/moderation/items/${itemId}/decision`, { action: 'remove', rule: 'ads', clawbackTransferIds: [toSpammer.id] });
    expect(ok.statusCode).toBe(200);
    expect(await tokens.balanceOf(db, spammer)).toBe(0);
  });
});
