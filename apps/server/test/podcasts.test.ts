// Podcasts, off by default. The switch is one shared row, so the "on" cases run in a
// transaction that is rolled back.
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as notebook from '../src/modules/notebook/index.js';
import * as podcasts from '../src/modules/podcasts/index.js';
import { app, as, createUser, db } from './helpers.js';

afterAll(() => db.end());

const show = (slug: string) => ({ slug, title: 'Morning Prayer & Praise', description: 'Ten minutes to start the day.', author: 'Prayer Tower', imageUrl: 'https://cdn.example/art.jpg' });
const episode = { title: 'Day 1: "Be still"', description: 'Psalm 46 <short>', audioUrl: 'https://cdn.example/ep1.mp3', audioBytes: 1234567, durationSeconds: 600, episodeNumber: 1 };

describe('Podcasts', () => {
  it('is off by default: members see nothing and the feed is not found', async () => {
    const admin = await createUser('Pod Admin');
    await grantRole(db, admin, 'admin', null);
    const member = await createUser('Pod Listener');
    const slug = `morning-${randomUUID().slice(0, 8)}`;
    expect((await as(member).post('/admin/podcasts', show(slug))).statusCode).toBe(403);
    const made = await as(admin).post('/admin/podcasts', show(slug));
    expect(made.statusCode).toBe(201);
    expect(made.json().show).toMatchObject({ slug, published: false, category: 'Religion & Spirituality' });
    const id = made.json().show.id;
    expect((await as(admin).post(`/admin/podcasts/${id}/episodes`, { ...episode, audioUrl: 'http://cdn.example/x.mp3' })).statusCode).toBe(400);
    expect((await as(admin).post(`/admin/podcasts/${id}/episodes`, { ...episode, publish: true })).statusCode).toBe(201);
    await as(admin).patch(`/admin/podcasts/${id}`, { published: true });
    expect((await as(member).get('/podcasts')).json().shows).toEqual([]);
    expect((await app.inject({ method: 'GET', url: `/podcasts/${slug}/feed.xml` })).statusCode).toBe(404);
    await db.query('delete from public.podcast_shows where id = $1', [id]);
  });

  it('when on, lists published episodes and serves a valid RSS feed', async () => {
    const admin = await createUser('Feed Admin');
    await grantRole(db, admin, 'admin', null);
    const member = await createUser('Feed Listener');
    const slug = `morning-${randomUUID().slice(0, 8)}`;
    const c = await db.connect();
    try {
      await c.query('begin');
      await notebook.updateSettings(c, { podcastsEnabled: true });
      const s = await podcasts.createShow(c, admin, podcasts.NewShow.parse(show(slug)));
      await podcasts.addEpisode(c, s.id, podcasts.NewEpisode.parse({ ...episode, publish: true }));
      const withDraft = await podcasts.addEpisode(c, s.id, podcasts.NewEpisode.parse({ ...episode, title: 'Draft', audioUrl: 'https://cdn.example/ep2.mp3' }));
      expect(withDraft.episodes).toHaveLength(2);
      expect(await podcasts.feed(c, slug, 'https://prayertower.example/')).toBeNull(); // the show isn't published yet
      await podcasts.updateShow(c, s.id, { published: true });

      const listed = await podcasts.forMember(c, member);
      expect(listed.find((x) => x.slug === slug)?.episodes.map((e) => e.title)).toEqual(['Day 1: "Be still"']);

      const rss = (await podcasts.feed(c, slug, 'https://prayertower.example/'))!;
      expect(rss).toContain('<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"');
      expect(rss).toContain('<title>Morning Prayer &amp; Praise</title>');
      expect(rss).toContain('<itunes:image href="https://cdn.example/art.jpg"/>');
      expect(rss).toContain('<itunes:category text="Religion &amp; Spirituality"/>');
      expect(rss).toContain('<title>Day 1: &quot;Be still&quot;</title>');
      expect(rss).toContain('<description>Psalm 46 &lt;short&gt;</description>');
      expect(rss).toContain('<enclosure url="https://cdn.example/ep1.mp3" length="1234567" type="audio/mpeg"/>');
      expect(rss).toMatch(/<pubDate>\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} \+0000<\/pubDate>/);
      expect(rss).not.toContain('Draft');

      // A community show for a neutral community defaults to a non-religious category.
      const oc = await podcasts.createShow(c, admin, podcasts.NewShow.parse({ ...show(`${slug}-oc`), community: 'open-circle' }));
      expect(oc.category).toBe('Society & Culture');
      expect((await podcasts.forMember(c, member)).some((x) => x.id === oc.id)).toBe(false);

      // Open Circle members get only their own shows, never the faith show made for everyone.
      await podcasts.updateShow(c, oc.id, { published: true });
      await podcasts.addEpisode(c, oc.id, podcasts.NewEpisode.parse({ ...episode, audioUrl: 'https://cdn.example/oc1.mp3', publish: true }));
      const circle = await createUser('Circle Listener');
      await c.query('delete from public.community_memberships where user_id = $1', [circle]);
      await c.query(
        `insert into public.community_memberships (community_id, user_id, is_primary) select id, $1, true from public.communities where slug = 'open-circle'`,
        [circle],
      );
      expect((await podcasts.forMember(c, circle)).map((x) => x.id)).toEqual([oc.id]);
    } finally {
      await c.query('rollback');
      c.release();
    }
  });

  it('asks the audio host for the size when the admin leaves it out', async () => {
    const admin = await createUser('Probe Admin');
    const c = await db.connect();
    try {
      await c.query('begin');
      const s = await podcasts.createShow(c, admin, podcasts.NewShow.parse(show(`probe-${randomUUID().slice(0, 8)}`)));
      const fakeFetch = (async () => new Response(null, { headers: { 'content-length': '987', 'content-type': 'audio/x-m4a' } })) as unknown as typeof fetch;
      const out = await podcasts.addEpisode(c, s.id, podcasts.NewEpisode.parse({ title: 'Probe', audioUrl: 'https://cdn.example/a.m4a' }), fakeFetch);
      expect(out.episodes[0]).toMatchObject({ audioBytes: 987, audioType: 'audio/x-m4a', publishedAt: null });
    } finally {
      await c.query('rollback');
      c.release();
    }
  });
});
