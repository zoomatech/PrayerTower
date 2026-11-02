// PrayerCast (Steve, 2026-11-02): a prayer sent by radio, posted publicly or PrayerCast privately.
// A private PrayerCast is shown to no one and its words are forgotten once it has been sent.
// radio_funding is a shared row, so these run in a rolled-back transaction.
import type { JobHelpers } from 'graphile-worker';
import { afterAll, describe, expect, it } from 'vitest';
import * as feed from '../src/modules/feed/index.js';
import * as posts from '../src/modules/posts/index.js';
import * as radio from '../src/modules/radio/index.js';
import { as, createUser, db } from './helpers.js';

afterAll(() => db.end());

describe('PrayerCast', () => {
  it('privately: never shown, sent by radio, then its words are forgotten', async () => {
    const [caster, other] = [await createUser('Private Caster'), await createUser('Private Neighbor')];
    const words = 'Lord, give me the courage to forgive my father.';
    const c = await db.connect();
    try {
      await c.query('begin');
      await c.query(`update public.token_settings set radio_funding = 'free'`);
      const post = await posts.create(c, caster, posts.NewPost.parse({ postType: 'prayer_request', body: words, isAnonymous: true }));
      await posts.makePrivateCast(c, post.id);
      const rp = await radio.queue(c, caster, post.id, `cast:${post.id}`);
      // Not on anyone's feed, the caster's own included, and no one else can act on it.
      for (const viewer of [caster, other]) {
        expect((await feed.getFeed(c, viewer)).posts.map((p: { id: string }) => p.id)).not.toContain(post.id);
      }
      expect(await posts.getActionable(c, other, post.id)).toBeNull();
      // Sent: the words go, on the request and in what was sent.
      await radio.transmitTask(c)({ radioPrayerId: rp.id }, {} as JobHelpers);
      const { rows } = await c.query<{ body: string; sent_text: string | null; status: string }>(
        `select p.body, r.sent_text, r.status from public.posts p join public.radio_prayers r on r.post_id = p.id where p.id = $1`,
        [post.id],
      );
      expect(rows[0]).toEqual({ body: posts.FORGOTTEN_CAST, sent_text: null, status: 'transmitted' });
    } finally {
      await c.query('rollback');
      c.release();
    }
  });

  it('needs a choice, public or private, and saves nothing when it cannot be sent', async () => {
    const caster = await createUser('Cast Chooser');
    const body = 'Please pray with me for my daughter starting school.';
    expect((await as(caster).post('/prayercast', { body, idempotencyKey: 'k1' })).statusCode).toBe(400);
    // Radio prayers cost Priestly tokens by default and a new member has none: nothing is posted.
    const r = await as(caster).post('/prayercast', { body, visibility: 'public', idempotencyKey: 'k2' });
    expect(r.statusCode).toBeGreaterThanOrEqual(400);
    const { rowCount } = await db.query('select 1 from public.posts where user_id = $1 and body = $2', [caster, body]);
    expect(rowCount).toBe(0);
  });
});
