import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as tokens from '../src/modules/tokens/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(async () => {
  await tokens.updateSettings(db, { radio_funding: 'tokens', amplify_paid_cost: null });
  await db.end();
});

describe('Amplify paid with Priestly tokens', () => {
  it('is off until an admin sets a price, then costs that many Priestly tokens', async () => {
    const admin = await createUser('Amp Admin');
    await grantRole(db, admin, 'admin', null);
    const poster = await createUser('Amp Poster');
    const sender = await createUser('Amp Payer');
    const post = await newRequest(poster, 'Pray for rain on our farm.');
    await tokens.updateSettings(db, { radio_funding: 'tokens' });
    const off = await as(sender).post(`/posts/${post.id}/radio`, { idempotencyKey: 'pa-1', amplify: true });
    expect(off.statusCode).toBe(409);
    expect((await as(sender).get('/me/tokens')).json().priestly).toMatchObject({ amplifyRepeats: null, amplifyCost: null });

    expect((await as(sender).patch('/admin/token-settings', { amplifyPaidCost: 3 })).statusCode).toBe(403);
    expect((await as(admin).patch('/admin/token-settings', { amplifyPaidCost: 3 })).json().settings.amplify_paid_cost).toBe(3);
    expect((await as(sender).get('/me/tokens')).json().priestly).toMatchObject({ amplifyRepeats: 3, amplifyCost: 3 });

    // Not enough Priestly tokens: refused, nothing taken.
    expect((await as(sender).post(`/posts/${post.id}/radio`, { idempotencyKey: 'pa-2', amplify: true })).statusCode).toBe(409);
    await tokens.awardBonus(db, sender, 'amplify-test', 4, 'priestly');
    const res = await as(sender).post(`/posts/${post.id}/radio`, { idempotencyKey: 'pa-3', amplify: true });
    expect(res.json().radioPrayer).toMatchObject({ cost: 3, repeats: 3 });
    expect(await tokens.balanceOf(db, sender, 'priestly')).toBe(1);

    // Turning the price off again refuses paid Amplify.
    await as(admin).patch('/admin/token-settings', { amplifyPaidCost: null });
    expect((await as(sender).post(`/posts/${post.id}/radio`, { idempotencyKey: 'pa-4', amplify: true })).statusCode).toBe(409);
  });
});
