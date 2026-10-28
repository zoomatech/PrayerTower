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
    expect(res.json().settings).toEqual({ priestly_prayers_per_token: 3, verified_prayer_min_gap_seconds: 0, radio_prayer_cost: 1, radio_funding: 'tokens' });
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
    expect(me.priestly).toEqual({ balance: 1, verifiedPrayers: 4, towardNext: 1, prayersPerToken: 3, radioPrayerCost: 1, amplifyRepeats: null });

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

  it('spends a Priestly token to send a request out by radio, once per key', async () => {
    await tokens.updateSettings(db, { priestly_prayers_per_token: 1, verified_prayer_min_gap_seconds: 0 });
    const asker = await createUser('Radio Asker');
    const sender = await createUser('Radio Sender');
    const post = await newRequest(asker, 'Please pray for rain.');
    expect((await as(sender).post(`/posts/${post.id}/radio`, { idempotencyKey: 'r1' })).statusCode).toBe(409); // no Priestly tokens yet
    await as(sender).post(`/posts/${post.id}/praying-now`);
    await drainJobs();
    expect(await tokens.balanceOf(db, sender, 'priestly')).toBe(1);

    const first = await as(sender).post(`/posts/${post.id}/radio`, { idempotencyKey: 'r1' });
    expect(first.statusCode).toBe(201);
    const again = await as(sender).post(`/posts/${post.id}/radio`, { idempotencyKey: 'r1' });
    expect(again.json().radioPrayer.id).toBe(first.json().radioPrayer.id);
    expect(await tokens.balanceOf(db, sender, 'priestly')).toBe(0);
    await drainJobs();

    const [sent] = (await as(sender).get('/me/radio-prayers')).json().radioPrayers;
    expect(sent.status).toBe('transmitted');
    const notes = (await as(asker).get('/me/notifications')).json().notifications;
    expect(notes.map((n: { kind: string }) => n.kind)).toContain('radio_prayer');
  });

  it('sends radio prayers free, once per request, when funding is switched to free', async () => {
    await tokens.updateSettings(db, { radio_funding: 'free' });
    const asker = await createUser('Free Asker');
    const sender = await createUser('Free Sender');
    const post = await newRequest(asker, 'Please pray for my town.');
    expect((await as(sender).get('/me/tokens')).json().priestly.radioPrayerCost).toBe(0);
    const first = await as(sender).post(`/posts/${post.id}/radio`, { idempotencyKey: 'f1' });
    expect(first.statusCode).toBe(201);
    expect(first.json().radioPrayer.cost).toBe(0);
    const second = await as(sender).post(`/posts/${post.id}/radio`, { idempotencyKey: 'f2' });
    expect(second.json().radioPrayer.id).toBe(first.json().radioPrayer.id);
    await tokens.updateSettings(db, { radio_funding: 'tokens' });
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

describe('feed styles', () => {
  it('offers Classic by default and lets a member switch to Vine, Flip or Swipe to pray and back', async () => {
    const u = await createUser('Styler');
    const choices = (await as(u).get('/me/feed-themes')).json();
    expect(choices.current).toBe('column');
    expect(choices.themes.map((t: { slug: string }) => t.slug).sort()).toEqual(['column', 'flip', 'swipe', 'vine']);
    expect((await as(u).put('/me/feed-theme', { slug: 'vine' })).json().current).toBe('vine');
    expect((await as(u).get('/feed')).json().theme.layout).toBe('vine');
    expect((await as(u).put('/me/feed-theme', { slug: 'swipe' })).json().current).toBe('swipe');
    expect((await as(u).get('/feed')).json().theme.layout).toBe('carousel');
    expect((await as(u).put('/me/feed-theme', { slug: 'nope' })).statusCode).toBe(404);
    expect((await as(u).put('/me/feed-theme', { slug: null })).json().current).toBe('column');
  });
});
