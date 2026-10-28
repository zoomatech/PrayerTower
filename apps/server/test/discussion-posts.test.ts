import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { as, createUser, db } from './helpers.js';

const DEFAULT_TYPES = '{prayer_request,praise,open_prayer,testimony,confessional}';

afterAll(async () => {
  await db.query(`update public.communities set enabled_post_types = $1 where is_default`, [DEFAULT_TYPES]);
  await db.end();
});

describe('discussion, news and blog posts', () => {
  it('are off until an admin turns them on for a community, and are never prayed for', async () => {
    const admin = await createUser('Blog Admin');
    await grantRole(db, admin, 'admin', null);
    const writer = await createUser('Blog Writer');
    const reader = await createUser('Blog Reader');
    const blog = { postType: 'blog', body: 'What our food pantry learned this year.' };
    expect((await as(writer).post('/posts', blog)).statusCode).toBe(400);

    expect((await as(writer).patch('/admin/communities/christian-ecumenical', { enabledPostTypes: ['blog'] })).statusCode).toBe(403);
    expect((await as(admin).patch('/admin/communities/christian-ecumenical', { enabledPostTypes: [] })).statusCode).toBe(400);
    const on = await as(admin).patch('/admin/communities/christian-ecumenical', {
      enabledPostTypes: ['prayer_request', 'praise', 'open_prayer', 'testimony', 'confessional', 'discussion', 'news', 'blog'],
    });
    expect(on.json().community.enabledPostTypes).toEqual(expect.arrayContaining(['discussion', 'news', 'blog']));

    const made = await as(writer).post('/posts', blog);
    expect(made.statusCode, made.body).toBe(201);
    const id = made.json().post.id;
    const card = (await as(reader).get(`/posts/${id}`)).json().post;
    expect(card.postType).toBe('blog');
    expect(card.actions).not.toContain('praying_now');
    expect(card.actions).not.toContain('commit');
    expect(card.actions).toContain('share');

    expect((await as(reader).post(`/posts/${id}/praying-now`, {})).statusCode).toBe(400);
    expect((await as(reader).post(`/posts/${id}/commitments`, { frequency: 'daily' })).statusCode).toBe(400);
    expect((await as(reader).post(`/posts/${id}/radio`, { idempotencyKey: 'blog-1' })).statusCode).toBe(400);
    expect((await as(reader).post(`/posts/${id}/comments`, { body: 'Thank you for sharing this.' })).statusCode).toBe(201);
  });
});
