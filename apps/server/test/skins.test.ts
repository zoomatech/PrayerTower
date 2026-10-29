// Feed skins (docs/FEED_SKINS.md): gated skins and the Wall, comment trees,
// member skin ideas and the video cap. Everything is off by default; the
// "on" cases run in a transaction that is rolled back (one shared settings row).
import type { PoolClient } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as feed from '../src/modules/feed/index.js';
import * as notebook from '../src/modules/notebook/index.js';
import * as posts from '../src/modules/posts/index.js';
import * as skins from '../src/modules/skins/index.js';
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

const SKINS = ['beanstalk', 'golden-wood', 'moonlit-gate', 'wall'];

describe('Feed skins', () => {
  it('are hidden and refused while off, then offered and chosen once on', async () => {
    const member = await createUser('Skin Member');
    const off = await feed.themeChoices(db, member);
    expect(off.themes.map((t) => t.slug)).not.toEqual(expect.arrayContaining(['beanstalk']));
    expect((await as(member).put('/me/feed-theme', { slug: 'wall' })).statusCode).toBe(404);
    const f = await notebook.features(db);
    expect(f).toMatchObject({
      feedSkins: false,
      commentTree: false,
      themeProposals: false,
      videoMaxSeconds: 7,
      commentTreeMaxDepth: 2,
      commentTreeLeaves: 5,
    });

    await inTx(async (c) => {
      await skins.updateSettings(c, { skinsEnabled: true });
      const on = await feed.themeChoices(c, member);
      expect(on.themes.map((t) => t.slug)).toEqual(expect.arrayContaining(SKINS));
      const chosen = await feed.chooseTheme(c, member, 'golden-wood');
      expect(chosen.current).toBe('golden-wood');
      expect(chosen.theme).toMatchObject({
        slug: 'golden-wood',
        layout: 'vine',
        tokens: { leafShape: 'pointed', stemWidth: 8 },
      });
      expect((await feed.chooseTheme(c, member, 'wall')).theme?.layout).toBe('wall');
      // Turning skins off again sends the member back to the plain column.
      await skins.updateSettings(c, { skinsEnabled: false });
      expect(await feed.theme(c, member)).toBeNull();
    });
  });

  it('are offered in Open Circle too', async () => {
    const { rows } = await db.query<{ slug: string }>(
      `select t.slug from public.community_feed_themes d join public.feed_themes t on t.id = d.theme_id
        join public.communities c on c.id = d.community_id where c.slug = 'open-circle' and t.gated`,
    );
    expect(rows.map((r) => r.slug).sort()).toEqual([...SKINS].sort());
  });
});

describe('Comment tree depth', () => {
  it('stops replies at the third level while the tree is on, and never while it is off', async () => {
    const [poster, a] = [await createUser('Tree Poster'), await createUser('Tree A')];
    const post = await newRequest(poster, 'Starting a new job on Monday.');
    await inTx(async (c) => {
      const top = await posts.addComment(c, a, post.id, {
        body: 'Praying for you!',
        isUpdate: false,
      });
      const second = await posts.addComment(c, poster, post.id, {
        body: 'Thank you.',
        parentId: top.id,
        isUpdate: false,
      });
      const third = await posts.addComment(c, a, post.id, {
        body: 'Any time.',
        parentId: second.id,
        isUpdate: false,
      });
      // Off: a fourth level is fine, as before.
      await c.query('savepoint s');
      await posts.addComment(c, poster, post.id, {
        body: 'Bless you.',
        parentId: third.id,
        isUpdate: false,
      });
      await c.query('rollback to savepoint s');

      await skins.updateSettings(c, { commentTreeEnabled: true });
      await expect(
        posts.addComment(c, poster, post.id, {
          body: 'Bless you.',
          parentId: third.id,
          isUpdate: false,
        }),
      ).rejects.toThrow(/grown as far/);
      // Side branches at the third level are still fine.
      await posts.addComment(c, poster, post.id, {
        body: 'You too.',
        parentId: second.id,
        isUpdate: false,
      });
      const list = await posts.listComments(c, post.id, a);
      expect(list.map((x) => x.depth)).toEqual([0, 1, 2, 2]);
    });
  });
});

describe('Video cap', () => {
  it('refuses a clip longer than the cap (7 seconds by default)', async () => {
    const member = await createUser('Video Member');
    const path = `${member}/00000000-0000-4000-8000-000000000001.mp4`;
    const long = await as(member).post('/posts', {
      postType: 'prayer_request',
      body: 'A short clip from the hospital garden.',
      media: [{ kind: 'video', storagePath: path, durationMs: 12_000 }],
    });
    expect(long.statusCode).toBe(400);
    expect(long.body).toMatch(/7 seconds/);
    const ok = await as(member).post('/posts', {
      postType: 'prayer_request',
      body: 'A short clip from the hospital garden.',
      media: [{ kind: 'video', storagePath: path, durationMs: 7_200 }],
    });
    expect(ok.statusCode).toBe(201);
    await inTx(async (c) => {
      await skins.updateSettings(c, { videoMaxSeconds: 15 });
      await expect(skins.checkVideos(c, [{ kind: 'video', durationMs: 12_000 }])).resolves.toBeUndefined();
    });
  });
});

describe('Skin ideas from members', () => {
  it('are refused while off; once on, admins approve one into a gated beta skin or decline it', async () => {
    const [member, admin] = [await createUser('Idea Member'), await createUser('Idea Admin')];
    await grantRole(db, admin, 'admin', null);
    const idea = {
      name: 'Sunflower Field',
      description: 'Tall sunflowers, each request a flower.',
      layout: 'vine',
      colors: { stem: '#3F7D20', leaf: '#F2C14E', backdrop: '#FFFBEA' },
    };
    expect((await as(member).post('/me/theme-proposals', idea)).statusCode).toBe(403);
    expect((await as(member).get('/admin/theme-proposals')).statusCode).toBe(403);

    await inTx(async (c) => {
      await skins.updateSettings(c, {
        proposalsEnabled: true,
        skinsEnabled: true,
      });
      await expect(
        skins.propose(c, member, {
          ...idea,
          colors: { ...idea.colors, stem: 'green' },
        } as never),
      ).rejects.toThrow();
      const p = await skins.propose(c, member, skins.NewProposal.parse(idea));
      expect(p).toMatchObject({ name: 'Sunflower Field', status: 'pending' });
      const second = await skins.propose(c, member, skins.NewProposal.parse({ ...idea, name: 'Second idea' }));
      await skins.propose(c, member, skins.NewProposal.parse({ ...idea, name: 'Third idea' }));
      await expect(skins.propose(c, member, skins.NewProposal.parse({ ...idea, name: 'Fourth idea' }))).rejects.toThrow(/3 skin ideas/);

      const approved = await skins.approve(c, admin, p.id, { note: 'Lovely.' });
      expect(approved.themeSlug).toMatch(/^sunflower-field-/);
      const choices = await feed.themeChoices(c, member);
      expect(choices.themes.find((t) => t.slug === approved.themeSlug)).toMatchObject({ status: 'beta', layout: 'vine' });
      await skins.decline(c, admin, second.id, {
        note: 'Too close to Beanstalk.',
      });
      await expect(skins.decline(c, admin, second.id, {})).rejects.toThrow(/Pending skin idea/);
      const mine = await skins.mine(c, member);
      expect(mine.find((x) => x.id === p.id)).toMatchObject({
        status: 'approved',
        reviewNote: 'Lovely.',
        themeSlug: approved.themeSlug,
      });
      expect((await skins.list(c))[0]).toMatchObject({
        status: 'pending',
        from: { name: 'Idea Member' },
      });
    });
  });
});
