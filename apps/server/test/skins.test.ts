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

const SKINS = ['beanstalk', 'golden-wood', 'moonlit-gate', 'wall', 'prayer-tower', 'neon-cinderella', 'neon-circuit', 'blossom-garden'];
const OPEN_CIRCLE_SKINS = ['beanstalk', 'blossom-garden', 'climbing-tower', 'golden-wood', 'moonlit-gate', 'neon-cinderella', 'neon-circuit', 'wall'];

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
      // Turning skins off again sends the member back to the community's usual feed.
      await skins.updateSettings(c, { skinsEnabled: false });
      expect((await feed.theme(c, member))?.slug).toBe('column');
    });
  });

  it('are offered in Open Circle too, the tower without a religious name', async () => {
    const { rows } = await db.query<{ slug: string }>(
      `select t.slug from public.community_feed_themes d join public.feed_themes t on t.id = d.theme_id
        join public.communities c on c.id = d.community_id where c.slug = 'open-circle' and t.gated and t.season is null`,
    );
    expect(rows.map((r) => r.slug).sort()).toEqual(OPEN_CIRCLE_SKINS);
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

describe('Theme maker', () => {
  it('builds a skin from the allowed tokens only', async () => {
    const member = await createUser('Maker Member');
    await inTx(async (c) => {
      await skins.updateSettings(c, { proposalsEnabled: true, skinsEnabled: true });
      const made = await skins.propose(c, member, {
        name: 'Night Garden',
        description: 'Glowing flowers on a dark sky.',
        layout: 'vine',
        tokens: { backdrop: '#101020', stem: '#7DF9FF', leaf: '#FF9EE6', leafShape: 'flower', stemGlow: true, stemWidth: 6 },
      });
      expect(made.tokens).toMatchObject({ leafShape: 'flower', stemGlow: true, leafEvery: 4 });
      const circuit = await skins.propose(c, member, { name: 'Green Wire', description: 'Green circuits.', layout: 'circuit', tokens: { wire: '#39FF14', tilt: 6 } });
      expect((await feed.chooseTheme(c, member, circuit.themeSlug!)).theme).toMatchObject({ layout: 'circuit', tokens: { wire: '#39FF14', tilt: 6 } });
      await expect(skins.propose(c, member, { name: 'Bad', description: 'x', layout: 'vine', tokens: { onPress: 'alert(1)' } } as never)).rejects.toThrow();
      await expect(skins.propose(c, member, { name: 'Bad', description: 'x', layout: 'vine', tokens: { stemWidth: 400 } } as never)).rejects.toThrow();
      // Comment bubbles too dark for the dark comment text are refused.
      await expect(skins.propose(c, member, { name: 'Murky', description: 'x', layout: 'vine', tokens: { leafSoft: '#333344' } })).rejects.toThrow(/too dark to read/);
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

      // The maker can use their own skin straight away; nobody else sees it yet.
      const other = await createUser('Idea Neighbor');
      expect((await feed.themeChoices(c, member)).themes.map((t) => t.slug)).toContain(p.themeSlug);
      expect((await feed.themeChoices(c, other)).themes.map((t) => t.slug)).not.toContain(p.themeSlug);
      await expect(feed.chooseTheme(c, other, p.themeSlug!)).rejects.toThrow();
      expect((await feed.chooseTheme(c, member, p.themeSlug!)).theme).toMatchObject({ layout: 'vine', tokens: { stem: '#3F7D20', leaf: '#F2C14E', backdrop: '#FFFBEA' } });

      const approved = await skins.approve(c, admin, p.id, { note: 'Lovely.' });
      expect(approved.themeSlug).toBe(p.themeSlug);
      expect((await feed.themeChoices(c, other)).themes.map((t) => t.slug)).toContain(p.themeSlug);
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

describe('Seasonal skins', () => {
  const advent = new Date('2026-12-01T12:00:00Z');
  const autumn = new Date('2026-10-29T12:00:00Z');
  it('show only in their season, and can dress members who never chose a style', async () => {
    const member = await createUser('Season Member');
    await inTx(async (c) => {
      await skins.updateSettings(c, { skinsEnabled: true });
      const slugs = async (now: Date) => (await feed.themeChoices(c, member, now)).themes.map((t) => t.slug);
      // Off: no seasonal skin, even in Advent.
      expect(await slugs(advent)).not.toContain('advent-wreath');
      await skins.updateSettings(c, { seasonalEnabled: true });
      expect(await slugs(advent)).toContain('advent-wreath');
      expect(await slugs(advent)).not.toContain('christmas-star');
      expect(await slugs(autumn)).not.toContain('advent-wreath');
      // Open Circle's weather skins never reach a faith community.
      expect(await slugs(autumn)).not.toContain('autumn-leaves');
      await expect(feed.chooseTheme(c, member, 'easter-lily', advent)).rejects.toThrow();

      // "Use the season's skin": members on the default see it by date.
      expect((await feed.theme(c, member, advent))?.slug).not.toBe('advent-wreath');
      await skins.updateSettings(c, { seasonalAuto: true });
      expect((await feed.theme(c, member, advent))?.slug).toBe('advent-wreath');
      // A member's own choice wins, and a seasonal choice falls back once its season ends.
      await feed.chooseTheme(c, member, 'beanstalk', advent);
      expect((await feed.theme(c, member, advent))?.slug).toBe('beanstalk');
      await feed.chooseTheme(c, member, 'advent-wreath', advent);
      const after = await feed.theme(c, member, new Date('2027-02-01T12:00:00Z'));
      expect(after?.slug).not.toBe('advent-wreath');
      expect(after).not.toBeNull();
    });
  });

  it('offers the weather skins to Open Circle only', async () => {
    const { rows } = await db.query<{ slug: string; communities: string[] }>(
      `select t.slug, array_agg(c.slug order by c.slug) as communities from public.feed_themes t
         join public.community_feed_themes d on d.theme_id = t.id join public.communities c on c.id = d.community_id
        where t.season in ('winter', 'spring', 'summer', 'autumn') group by t.slug`,
    );
    expect(rows.map((r) => r.slug).sort()).toEqual(['autumn-leaves', 'spring-bloom', 'summer-sun', 'winter-frost']);
    for (const r of rows) expect(r.communities).toEqual(['open-circle']);
  });
});

describe('Skin files (Claude Design handoff)', () => {
  const file = { slug: 'harvest-moon', name: 'Harvest Moon', layout: 'vine', tokens: { backdrop: '#1B1B3A', stem: '#F2C14E', leaf: '#F28C28', leafShape: 'round', tipText: 'Top of the field.' } };
  it('turns a checked skin file into a gated theme row', async () => {
    const sql = skins.skinMigration(file);
    expect(sql).toContain(`'harvest-moon', 'Harvest Moon', 'vine', 'beta', true, null`);
    await inTx(async (c) => {
      await c.query(sql);
      const { rows } = await c.query(`select gated, tokens from public.feed_themes where slug = 'harvest-moon'`);
      expect(rows[0]).toMatchObject({ gated: true, tokens: { leafShape: 'round', tipText: 'Top of the field.' } });
    });
  });

  it('refuses unknown tokens, bad slugs and unreadable comment colors', () => {
    expect(() => skins.skinMigration({ ...file, tokens: { onPress: 'x' } })).toThrow();
    expect(() => skins.skinMigration({ ...file, slug: 'Harvest Moon' })).toThrow();
    expect(() => skins.skinMigration({ ...file, tokens: { leafSoft: '#222222' } })).toThrow(/too dark/);
    expect(() => skins.skinMigration({ ...file, name: "O'Brien's Field" })).not.toThrow();
  });
});
