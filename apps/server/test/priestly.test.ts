import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as tokens from '../src/modules/tokens/index.js';
import { as, createUser, db, drainJobs, newRequest } from './helpers.js';

const defaults = await tokens.settings(db);
afterAll(async () => {
  await tokens.updateSettings(db, defaults);
  await db.end();
});

describe('priestly tokens', () => {
  it('ships with 10 verified prayers per Priestly token, admin-configurable', async () => {
    expect(defaults.priestly_prayers_per_token).toBe(10);
    const admin = await createUser('Admin');
    const member = await createUser('Member');
    await grantRole(db, admin, 'admin', admin);
    expect((await as(member).patch('/admin/token-settings', { priestlyPrayersPerToken: 3 })).statusCode).toBe(403);
    const res = await as(admin).patch('/admin/token-settings', { priestlyPrayersPerToken: 3, verifiedPrayerMinGapSeconds: 0 });
    expect(res.json().settings).toEqual({ priestly_prayers_per_token: 3, verified_prayer_min_gap_seconds: 0 });
  });

  it('earns one Priestly token per N verified prayers for other people, then gifts and donates it', async () => {
    await tokens.updateSettings(db, { priestly_prayers_per_token: 3, verified_prayer_min_gap_seconds: 0 });
    const asker = await createUser('Asker');
    const pray = await createUser('Pray-er');
    const friend = await createUser('Friend');
    const own = await newRequest(pray, 'My own request.');
    await as(pray).post(`/posts/${own.id}/praying-now`); // own request: not verified
    for (const body of ['One.', 'Two.', 'Three.', 'Four.']) {
      const post = await newRequest(asker, body);
      await as(pray).post(`/posts/${post.id}/praying-now`);
    }
    await drainJobs();

    const me = (await as(pray).get('/me/tokens')).json();
    expect(me.balance).toBe(4); // one regular token per prayer for someone else
    expect(me.priestly).toEqual({ balance: 1, verifiedPrayers: 4, towardNext: 1, prayersPerToken: 3 });

    // Re-running the follow-up job does not double count.
    const { rows } = await db.query<{ id: string }>('select id from public.prayer_events where user_id = $1', [pray]);
    for (const r of rows) expect(await tokens.creditPriestlyProgress(db, r.id)).toBe(0);

    const gift = await as(pray).post('/tokens/gift', { toUserId: friend, amount: 1, idempotencyKey: 'g1', currency: 'priestly' });
    expect(gift.statusCode).toBe(200);
    expect(await tokens.balanceOf(db, friend, 'priestly')).toBe(1);
    expect(await tokens.balanceOf(db, friend)).toBe(0);
    const donate = await as(friend).post('/tokens/priestly/donate', { amount: 1, idempotencyKey: 'd1' });
    expect(donate.json().priestly.balance).toBe(0);
    expect((await as(friend).post('/tokens/priestly/donate', { amount: 1, idempotencyKey: 'd2' })).statusCode).toBe(409);
  });

  it('does not verify prayers that come too soon after the last one', async () => {
    await tokens.updateSettings(db, { priestly_prayers_per_token: 1, verified_prayer_min_gap_seconds: 3600 });
    const asker = await createUser('Asker');
    const pray = await createUser('Quick');
    for (const body of ['A.', 'B.', 'C.']) {
      const post = await newRequest(asker, body);
      await as(pray).post(`/posts/${post.id}/praying-now`);
    }
    await drainJobs();
    const { priestly } = (await as(pray).get('/me/tokens')).json();
    expect(priestly.verifiedPrayers).toBe(1);
    expect(priestly.balance).toBe(1);
  });

  it('never mixes currencies in one transfer', async () => {
    const u = await createUser('Mixer');
    const { rows } = await db.query<{ r: string; p: string }>(
      `select public.token_user_account($1, 'regular') as r, public.token_user_account($1, 'priestly') as p`,
      [u],
    );
    await tokens.earn(db, u, 1, `earn:mix:${u}`, 'test');
    await expect(
      db.query(`select public.post_token_transfer('mix:${u}', 'gift', $1, $2, 1)`, [rows[0]!.r, rows[0]!.p]),
    ).rejects.toThrow(/mix token currencies/);
  });

  it('keeps the ledger balanced', async () => {
    expect((await db.query('select * from public.token_ledger_audit')).rows).toEqual([]);
  });
});
