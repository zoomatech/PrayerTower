import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as reach from '../src/modules/reach/index.js';
import * as tokens from '../src/modules/tokens/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

const defaults = await reach.settings(db);
afterAll(async () => {
  await db.query(
    `update public.reach_settings set power_prayer_reach = $1, power_prayer_free_per_week = $2, power_prayer_cost = $3,
            power_prayer_max_per_recipient_day = $4, power_prayer_active_days = $5`,
    [defaults.power_prayer_reach, defaults.power_prayer_free_per_week, defaults.power_prayer_cost, defaults.power_prayer_max_per_recipient_day, defaults.power_prayer_active_days],
  );
  await db.end();
});

async function member(name: string) {
  const id = await createUser(name);
  await as(id).patch('/me', { completeOnboarding: true });
  return id;
}

/** A member who prayed for someone recently, so counts as a live pray-er. */
async function livePrayer(name: string, someonesPost: string) {
  const id = await member(name);
  await as(id).post(`/posts/${someonesPost}/praying-now`);
  return id;
}

describe('power prayer', () => {
  it('ships placeholder defaults that admins can change', async () => {
    expect(defaults).toEqual({
      power_prayer_reach: 10,
      power_prayer_free_per_week: 1,
      power_prayer_cost: 5,
      power_prayer_max_per_recipient_day: 3,
      power_prayer_active_days: 14,
    });
    const admin = await createUser('Reach Admin');
    await grantRole(db, admin, 'admin', null);
    const res = await as(admin).patch('/admin/reach-settings', { powerPrayerReach: 1000, powerPrayerCost: 2 });
    expect(res.json().settings).toMatchObject({ power_prayer_reach: 1000, power_prayer_cost: 2 });
  });

  it('asks live pray-ers who do not know the poster, once each, then charges tokens after the free one', async () => {
    const poster = await member('Hannah');
    const sender = await member('Elkanah');
    const other = await newRequest(await member('Someone'), 'Another request.');
    const post = await newRequest(poster, 'Pray that I may have a child.');

    const stranger = await livePrayer('Stranger', other.id);
    const friend = await livePrayer('Friend', other.id);
    await as(friend).put(`/people/${poster}/follow`);
    const alreadyPrayed = await livePrayer('Already', other.id);
    await as(alreadyPrayed).post(`/posts/${post.id}/praying-now`);
    const inactive = await member('Inactive');
    const blocker = await livePrayer('Blocker', other.id);
    await db.query('insert into public.user_blocks (user_id, blocked_id) values ($1, $2)', [blocker, poster]);
    // An Open Circle member who prays a lot is never sent a faith request.
    const circle = await livePrayer('Circle Prayer', other.id);
    await db.query('delete from public.community_memberships where user_id = $1', [circle]);
    await db.query(
      `insert into public.community_memberships (community_id, user_id, is_primary) select id, $1, true from public.communities where slug = 'open-circle'`,
      [circle],
    );

    expect((await as(sender).get('/me/power-prayer')).json()).toEqual({ reach: 1000, freeLeft: 1, cost: 0, blockedReason: null });
    const first = await as(sender).post(`/posts/${post.id}/power-prayer`, { idempotencyKey: 'pp1' });
    expect(first.statusCode).toBe(201);
    expect(first.json().powerPrayer.cost).toBe(0);
    expect(first.json().next).toEqual({ reach: 1000, freeLeft: 0, cost: 2, blockedReason: null });

    const asked = (await db.query('select user_id from public.power_prayer_recipients where post_id = $1', [post.id])).rows.map((r) => r.user_id);
    expect(asked).toContain(stranger);
    for (const notAsked of [poster, sender, friend, alreadyPrayed, inactive, blocker, circle]) expect(asked).not.toContain(notAsked);
    const note = (await as(stranger).get('/me/notifications')).json().notifications.find((n: { kind: string }) => n.kind === 'power_prayer');
    expect(note).toMatchObject({ title: 'Will you pray for this request?', body: 'Pray that I may have a child.' });
    expect(JSON.stringify(note)).not.toContain('Elkanah');

    // Same key: no repeat. Second Power Prayer costs tokens and asks no one twice.
    expect((await as(sender).post(`/posts/${post.id}/power-prayer`, { idempotencyKey: 'pp1' })).json().powerPrayer.id).toBe(first.json().powerPrayer.id);
    expect((await as(sender).post(`/posts/${post.id}/power-prayer`, { idempotencyKey: 'pp2' })).statusCode).toBe(409); // no tokens
    await tokens.earn(db, sender, 2, `t:${sender}:pp`, 'test');
    const second = await as(sender).post(`/posts/${post.id}/power-prayer`, { idempotencyKey: 'pp2' });
    expect(second.json().powerPrayer).toMatchObject({ cost: 2, reached: 0 });
    expect(second.json().balance).toBe(0);
    expect(await tokens.reachOf(db, post.id)).toBe(2);
  });

  it('caps asks per person per day', async () => {
    await db.query('update public.reach_settings set power_prayer_max_per_recipient_day = 1, power_prayer_free_per_week = 100');
    const other = await newRequest(await member('Elsewhere'), 'Elsewhere.');
    const target = await livePrayer('Popular', other.id);
    const sender = await member('Busy Sender');
    const a = await newRequest(await member('Poster A'), 'Request A.');
    const b = await newRequest(await member('Poster B'), 'Request B.');
    await as(sender).post(`/posts/${a.id}/power-prayer`, { idempotencyKey: 'a' });
    await as(sender).post(`/posts/${b.id}/power-prayer`, { idempotencyKey: 'b' });
    const { rows } = await db.query('select count(*)::int as n from public.power_prayer_recipients where user_id = $1', [target]);
    expect(rows[0].n).toBe(1);
  });
});
