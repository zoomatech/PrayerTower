import { afterAll, describe, expect, it } from 'vitest';
import { purge, REMOVED_TEXT } from '../src/modules/retention/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(async () => {
  await db.end();
});

const ago = (days: number) => `now() - interval '${days} days'`;

describe('data retention', () => {
  it('erases removed content after the period, unless an appeal is pending', async () => {
    const poster = await createUser('Gomer');
    const old = await newRequest(poster, 'Removed long ago, text should go.');
    const recent = await newRequest(poster, 'Removed yesterday, text stays for appeals.');
    const appealed = await newRequest(poster, 'Removed long ago but under appeal.');
    const visible = await newRequest(poster, 'Never removed.');
    await db.query(`update public.posts set moderation_status = 'removed', created_at = ${ago(200)} where id = any($1)`, [[old.id, appealed.id]]);
    await db.query(`update public.posts set moderation_status = 'removed' where id = $1`, [recent.id]);
    await db.query(`update public.posts set created_at = ${ago(200)} where id = $1`, [visible.id]);
    await db.query(`insert into public.post_media (post_id, user_id, kind, storage_path) values ($1, $2, 'image', $3)`, [old.id, poster, `${poster}/old.jpg`]);
    const { rows: [item] } = await db.query<{ id: string }>(
      `insert into public.moderation_items (target_type, target_id, user_id, community_id, source, status, decided_at)
       values ('post', $1, $2, public.default_community_id(), 'report', 'actioned', ${ago(200)}) returning id`,
      [appealed.id, poster],
    );
    await db.query(`insert into public.moderation_appeals (moderation_item_id, user_id, message) values ($1, $2, 'Please look again.')`, [item!.id, poster]);

    const r = await purge(db, { removedDays: 90, notificationDays: 0, queueDays: 0 });
    expect(r.mediaPaths).toContain(`${poster}/old.jpg`);
    const body = async (id: string) => (await db.query<{ body: string }>('select body from public.posts where id = $1', [id])).rows[0]!.body;
    expect(await body(old.id)).toBe(REMOVED_TEXT);
    expect(await body(recent.id)).toBe('Removed yesterday, text stays for appeals.');
    expect(await body(appealed.id)).toBe('Removed long ago but under appeal.');
    expect(await body(visible.id)).toBe('Never removed.');
    expect((await db.query('select 1 from public.post_media where post_id = $1', [old.id])).rowCount).toBe(0);

    // Comments too; a second run finds nothing new.
    const commenter = await createUser('Hosea');
    const c = await as(commenter).post(`/posts/${visible.id}/comments`, { body: 'Removed comment text.' });
    const commentId = c.json().comment.id;
    await db.query(`update public.comments set moderation_status = 'removed', created_at = ${ago(100)} where id = $1`, [commentId]);
    const again = await purge(db, { removedDays: 90, notificationDays: 0, queueDays: 0 });
    expect(again.posts).toBe(0);
    expect(again.comments).toBeGreaterThanOrEqual(1);
    expect((await db.query<{ body: string }>('select body from public.comments where id = $1', [commentId])).rows[0]!.body).toBe(REMOVED_TEXT);
  });

  it('deletes old notifications and finished queues, and 0 turns a purge off', async () => {
    const u = await createUser('Lois');
    await db.query(
      `insert into public.notifications (user_id, kind, title, body, created_at) values
        ($1, 'test', 'old', 'old', ${ago(120)}), ($1, 'test', 'new', 'new', now())`,
      [u],
    );
    await db.query(`insert into public.push_tokens (user_id, token, disabled_at) values ($1, $2, ${ago(60)}), ($1, $3, null)`, [u, `dead-${u}`, `live-${u}`]);
    await db.query(
      `insert into public.account_deletion_requests (email, status, handled_at) values ($1, 'deleted', ${ago(60)}), ($2, 'pending', null)`,
      [`gone-${u}@test.local`, `waiting-${u}@test.local`],
    );

    const off = await purge(db, { removedDays: 0, notificationDays: 0, queueDays: 0 });
    expect(off.notifications + off.pushTokens + off.deletionRequests).toBe(0);

    await purge(db, { removedDays: 0, notificationDays: 90, queueDays: 30 });
    const titles = (await db.query<{ title: string }>('select title from public.notifications where user_id = $1', [u])).rows.map((x) => x.title);
    expect(titles).toEqual(['new']);
    const tokens = (await db.query<{ token: string }>('select token from public.push_tokens where user_id = $1', [u])).rows.map((x) => x.token);
    expect(tokens).toEqual([`live-${u}`]);
    const emails = (await db.query<{ email: string }>('select email from public.account_deletion_requests where email like $1', [`%${u}%`])).rows.map((x) => x.email);
    expect(emails).toEqual([`waiting-${u}@test.local`]);
  });
});
