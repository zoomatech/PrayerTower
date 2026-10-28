// Praying across lines (off by default): one request a day from another faith
// community, when both people opted in; never into or out of Open Circle.
// The switch is a shared row, so the "on" case runs in a rolled-back transaction.
import type { PoolClient } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import * as across from '../src/modules/across/index.js';
import * as notebook from '../src/modules/notebook/index.js';
import * as posts from '../src/modules/posts/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(() => db.end());

async function moveTo(c: PoolClient, userId: string, slug: string) {
  await c.query('delete from public.community_memberships where user_id = $1', [userId]);
  await c.query('insert into public.community_memberships (community_id, user_id, is_primary) select id, $1, true from public.communities where slug = $2', [userId, slug]);
}

describe('Praying across lines', () => {
  it('shows an opted-in member one request from another faith community, never from or to Open Circle', async () => {
    const [poster, viewer, secular] = [await createUser('Across Poster'), await createUser('Across Viewer'), await createUser('Across Secular')];
    const post = await newRequest(poster, 'Please pray for my brother’s new job.');
    expect((await as(viewer).get('/across')).json().card).toBeNull();

    const c = await db.connect();
    try {
      await c.query('begin');
      await c.query(`insert into public.communities (slug, name, tradition) values ('across-test', 'Across Test', 'christian')`);
      await c.query(`update public.communities set status = 'active' where slug = 'open-circle'`);
      await moveTo(c, viewer, 'across-test');
      await moveTo(c, secular, 'open-circle');
      await notebook.updateSettings(c, { crossCommunityEnabled: true });
      expect(await across.today(c, viewer)).toBeNull(); // nobody opted in yet
      expect(await posts.getActionable(c, viewer, post.id)).toBeNull();

      await c.query('update public.profiles set open_to_other_communities = true where id = any($1::uuid[])', [[poster, viewer, secular]]);
      expect((await across.today(c, viewer))?.id).toBe(post.id);
      expect(await posts.getActionable(c, viewer, post.id)).not.toBeNull();
      // Open Circle stays apart, both ways.
      expect(await across.today(c, secular)).toBeNull();
      expect(await posts.getActionable(c, secular, post.id)).toBeNull();

      await notebook.updateSettings(c, { crossCommunityEnabled: false });
      expect(await across.today(c, viewer)).toBeNull();
    } finally {
      await c.query('rollback');
      c.release();
    }
  });
});
