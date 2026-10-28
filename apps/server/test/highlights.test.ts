import { afterAll, describe, expect, it } from 'vitest';
import { highlights } from '../src/modules/highlights/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(() => db.end());

describe('highlights', () => {
  it('shows the most-prayed requests and top warriors, respecting anonymity and never sensitive posts', async () => {
    const poster = await createUser('Highlight Poster');
    const popular = await newRequest(poster, 'Pray for the highlight test family.');
    const sensitive = await newRequest(poster, 'Graphic highlight test.', { isSensitive: true });
    const named = await createUser('Named Warrior');
    const hidden = await createUser('Hidden Warrior');
    await as(hidden).patch('/me', { anonymousByDefault: true });
    // Enough prayers to beat anything else in the shared test database this week.
    const extra = await Promise.all(Array.from({ length: 30 }, (_, i) => createUser(`Extra ${i}`)));
    for (const u of [named, hidden, ...extra]) {
      await as(u).post(`/posts/${popular.id}/praying-now`);
      await as(u).post(`/posts/${sensitive.id}/praying-now`);
    }
    const h = (await as(poster).get('/highlights')).json();
    expect(h.topPrayers[0]).toMatchObject({ prayers: 32, card: { id: popular.id } });
    expect(h.topPrayers.some((t: { card: { id: string } }) => t.card.id === sensitive.id)).toBe(false);
    const names = h.topWarriors.map((w: { displayName: string }) => w.displayName);
    expect(names).not.toContain('Hidden Warrior');
    expect(JSON.stringify(h)).not.toContain(hidden);
  });

  it("keeps each community's highlights to itself and leaves out blocked members", async () => {
    const poster = await createUser('Faith Highlight Poster');
    const post = await newRequest(poster, 'Pray for the edition highlight test.');
    const prayer = await createUser('Faith Highlight Warrior');
    const circle = await createUser('Circle Highlight Viewer');
    const blocker = await createUser('Highlight Blocker');
    const neighbour = await createUser('Highlight Neighbour');
    const c = await db.connect();
    try {
      // Only this test's prayers count, so the post and warrior would top the lists if they leaked.
      await c.query('begin');
      await c.query('delete from public.prayer_events');
      await c.query(`insert into public.prayer_events (post_id, user_id, kind) values ($1, $2, 'praying_now')`, [post.id, prayer]);
      await c.query('delete from public.community_memberships where user_id = $1', [circle]);
      await c.query(
        `insert into public.community_memberships (community_id, user_id, is_primary) select id, $1, true from public.communities where slug = 'open-circle'`,
        [circle],
      );
      await c.query('insert into public.user_blocks (user_id, blocked_id) values ($1, $2), ($1, $3)', [blocker, poster, prayer]);
      const ids = (h: Awaited<ReturnType<typeof highlights>>) => [h.topPrayers.map((t) => t.card.id), h.topWarriors.map((w) => w.id)];
      expect(ids(await highlights(c, neighbour))).toEqual([[post.id], [prayer]]);
      expect(ids(await highlights(c, circle))).toEqual([[], []]);
      expect(ids(await highlights(c, blocker))).toEqual([[], []]);
    } finally {
      await c.query('rollback');
      c.release();
    }
  });
});
