// Notebook ideas found in the Development Plan and Project Management Document, each off by default:
// quick reactions (long-press), a town on profiles, and the award winner's prize choice.
// The switches are one shared row, so the "on" cases run in a transaction that is rolled back.
import type { PoolClient } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import * as awards from '../src/modules/admin/awards.js';
import * as notebook from '../src/modules/notebook/index.js';
import * as posts from '../src/modules/posts/index.js';
import * as quick from '../src/modules/quick-reactions/index.js';
import * as tiers from '../src/modules/tiers/index.js';
import * as tokens from '../src/modules/tokens/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(() => db.end());

async function inTx(fn: (c: PoolClient) => Promise<void>) {
  const c = await db.connect();
  try {
    await c.query('begin');
    await fn(c);
  } finally {
    await c.query('rollback');
    c.release();
  }
}

describe('Quick reactions', () => {
  it('are refused while off; once on, each member lights one candle and stands with the poster once', async () => {
    const [poster, a, b] = [await createUser('Quick Poster'), await createUser('Quick A'), await createUser('Quick B')];
    const post = await newRequest(poster, 'Big exam tomorrow, a little nervous.');
    expect((await as(a).put(`/posts/${post.id}/quick-reactions/candle`)).statusCode).toBe(400);
    expect((await as(a).put(`/posts/${post.id}/quick-reactions/confetti`)).statusCode).toBe(400);

    await inTx(async (c) => {
      await notebook.updateSettings(c, { reactionTrayEnabled: true });
      await quick.set(c, a, post.id, 'candle', true);
      await quick.set(c, a, post.id, 'candle', true); // once only
      await quick.set(c, b, post.id, 'candle', true);
      expect(await quick.set(c, b, post.id, 'standing', true)).toEqual({ candles: 2, standing: 1, thumbsUp: 0, mine: ['candle', 'standing'] });
      expect(await quick.set(c, b, post.id, 'candle', false)).toEqual({ candles: 1, standing: 1, thumbsUp: 0, mine: ['standing'] });
      const [card] = await posts.cards(c, [post.id], a);
      expect(card!.counts).toMatchObject({ candles: 1, standing: 1 });
      expect(card!.myQuickReactions).toEqual(['candle']);
    });
  });

  it('thumbs up works while the tray is off, once per member, and can be taken back', async () => {
    const [poster, a] = [await createUser('Thumbs Poster'), await createUser('Thumbs A')];
    const post = await newRequest(poster, 'Starting a new job on Monday.');
    expect((await as(a).put(`/posts/${post.id}/quick-reactions/thumbs_up`)).json()).toMatchObject({ thumbsUp: 1, mine: ['thumbs_up'] });
    expect((await as(a).put(`/posts/${post.id}/quick-reactions/thumbs_up`)).json()).toMatchObject({ thumbsUp: 1 });
    await inTx(async (c) => {
      const [card] = await posts.cards(c, [post.id], a);
      expect(card!.counts).toMatchObject({ thumbsUp: 1 });
      expect(card!.actions[0]).toBe('thumbs_up');
    });
    expect((await as(a).delete(`/posts/${post.id}/quick-reactions/thumbs_up`)).json()).toMatchObject({ thumbsUp: 0, mine: [] });
  });
});

describe('Town on profiles', () => {
  it('shows "in <town>" only while on, and only to members of the post’s community', async () => {
    const [carol, friend, outsider] = [await createUser('Carol Town'), await createUser('Town Friend'), await createUser('Town Outsider')];
    expect((await as(carol).patch('/me', { town: 'Albuquerque' })).json().profile.town).toBe('Albuquerque');
    const post = await newRequest(carol, 'Moving house this weekend.');
    const { rows } = await db.query<{ community_id: string }>('select community_id from public.posts where id = $1', [post.id]);
    const community = rows[0]!.community_id;
    for (const u of [carol, friend]) {
      await db.query('insert into public.community_memberships (community_id, user_id, is_primary) values ($1, $2, true) on conflict do nothing', [community, u]);
    }
    await db.query('delete from public.community_memberships where user_id = $1 and community_id = $2', [outsider, community]);
    expect((await posts.cards(db, [post.id], friend))[0]!.author.town ?? null).toBeNull(); // off

    await inTx(async (c) => {
      await notebook.updateSettings(c, { memberTownEnabled: true });
      expect((await posts.cards(c, [post.id], friend))[0]!.author.town).toBe('Albuquerque');
      expect((await posts.cards(c, [post.id], outsider))[0]!.author.town ?? null).toBeNull();
      await c.query('update public.posts set is_anonymous = true where id = $1', [post.id]);
      expect((await posts.cards(c, [post.id], friend))[0]!.author.town ?? null).toBeNull();
    });
    expect((await as(carol).patch('/me', { town: null })).json().profile.town).toBeNull();
  });
});

describe('Award prize choice', () => {
  it('keeps the whole prize while off; once on, a split winner gives half to the infrastructure fund', async () => {
    const [kept, split] = [await createUser('Prize Keeper'), await createUser('Prize Splitter')];
    await inTx(async (c) => {
      await awards.updateSettings(c, { enabled: true, tokenPrize: 25, priestlyPrize: 2 });
      const offer = async (user: string, rank: number) =>
        (await c.query<{ id: string }>(`insert into public.prayer_warrior_awards (year, rank, user_id, prayers, checkins, people) values (2031, $1, $2, 10, 0, 3) returning id`, [rank, user])).rows[0]!.id;
      const first = await offer(kept, 1);
      const second = await offer(split, 2);

      expect(await awards.accept(c, kept, first, { showName: false, prize: 'donate' })).toMatchObject({ prizeChoice: 'keep', tokens: 25, priestly: 2 });
      await notebook.updateSettings(c, { prizeChoiceEnabled: true });
      expect(await awards.accept(c, split, second, { showName: false, prize: 'split' })).toEqual({
        accepted: true, prizeChoice: 'split', tokens: 13, priestly: 1, donated: { tokens: 12, priestly: 1 },
      });
      expect(await tokens.balanceOf(c, split)).toBe(13);
      expect(await tokens.balanceOf(c, split, 'priestly')).toBe(1);
      const mine = await awards.mine(c, split);
      expect(mine.awards[0]).toMatchObject({ prizeChoice: 'split' });
    });
  });
});

describe('Post anatomy lines', () => {
  it('are off by default and reach the app once an admin turns them on', async () => {
    expect((await notebook.features(db)).postLines).toBe(false);
    await inTx(async (c) => {
      expect((await notebook.updateSettings(c, { postLinesEnabled: true })).post_lines_enabled).toBe(true);
      expect((await notebook.features(c)).postLines).toBe(true);
    });
  });
});

describe('Check-in affirmation', () => {
  it('is off by default and reaches the app once an admin turns it on', async () => {
    expect((await notebook.features(db)).checkinAffirmation).toBe(false);
    await inTx(async (c) => {
      expect((await notebook.updateSettings(c, { checkinAffirmationEnabled: true })).checkin_affirmation_enabled).toBe(true);
      expect((await notebook.features(c)).checkinAffirmation).toBe(true);
    });
  });
});

describe('Tier upkeep', () => {
  it('holds a member one tier lower until they give or spend a token, only while on', async () => {
    const [member, friend] = [await createUser('Upkeep Member'), await createUser('Upkeep Friend')];
    await inTx(async (c) => {
      // Everyone reaches Prayerful Helper (rank 2) for this test.
      await c.query("update public.tier_settings set min_prayer_events = 0 where tier = 'prayerful_helper' and community_id is null");
      expect((await tiers.status(c, member)).tier?.tier).toBe('prayerful_helper');
      expect((await tiers.status(c, member)).upkeep ?? null).toBeNull(); // off

      await notebook.updateSettings(c, { tierUpkeepEnabled: true, tierUpkeepDays: 14 });
      const held = await tiers.status(c, member);
      expect(held.tier?.tier).toBe('prayer_scout');
      expect(held.upkeep).toEqual({ days: 14, held: { tier: 'prayerful_helper', label: expect.any(String) } });
      expect((await tiers.tiersOf(c, [member])).get(member)?.tier).toBe('prayer_scout');

      await tokens.earn(c, member, 3, `upkeep-earn:${member}`, 'test');
      expect((await tiers.status(c, member)).tier?.tier).toBe('prayer_scout'); // earning is not giving or spending
      await tokens.gift(c, member, friend, 1, `upkeep:${member}`);
      const kept = await tiers.status(c, member);
      expect(kept.tier?.tier).toBe('prayerful_helper');
      expect(kept.upkeep).toEqual({ days: 14, held: null });
    });
  });
});
