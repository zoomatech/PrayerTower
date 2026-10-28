// Regression tests for the full-repo bug hunt (2026-10-28).
import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as tokens from '../src/modules/tokens/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(async () => {
  await db.end();
});

describe('blocking', () => {
  it('stops a blocked member from commenting, encouraging, praying, committing, following or viewing', async () => {
    const poster = await createUser('Blocker');
    const pest = await createUser('Pest');
    const post = await newRequest(poster, 'Pray for my family.');
    await as(pest).put(`/people/${poster}/follow`);
    expect((await as(poster).put(`/people/${pest}/block`)).statusCode).toBe(200);

    expect((await as(pest).post(`/posts/${post.id}/comments`, { body: 'Hello again' })).statusCode).toBe(404);
    expect((await as(pest).post(`/posts/${post.id}/reactions`, { kind: 'encouragement', note: 'Hi' })).statusCode).toBe(404);
    expect((await as(pest).post(`/posts/${post.id}/praying-now`, {})).statusCode).toBe(404);
    expect((await as(pest).post(`/posts/${post.id}/commitments`, { frequency: 'daily', vowText: 'I will pray' })).statusCode).toBe(404);
    expect((await as(pest).put(`/people/${poster}/follow`)).statusCode).toBe(404);
    expect((await as(pest).get(`/people/${poster}`)).statusCode).toBe(404);
    expect((await as(pest).get('/feed?pageSize=50')).json().posts.some((p: { id: string }) => p.id === post.id)).toBe(false);
    const { rows } = await db.query('select count(*)::int as n from public.notifications where user_id = $1 and kind = $2', [poster, 'encouragement']);
    expect(rows[0].n).toBe(0);
  });
});

describe('suspension', () => {
  it('still lets a suspended member block, report and delete their account', async () => {
    const member = await createUser('Suspended');
    const other = await createUser('Other');
    const post = await newRequest(other, 'Pray for rain.');
    await db.query(`update public.profiles set suspended_until = now() + interval '7 days' where id = $1`, [member]);

    expect((await as(member).post('/posts', { postType: 'prayer_request', body: 'Hi' })).statusCode).toBe(403);
    expect((await as(member).put(`/people/${other}/block`)).statusCode).toBe(200);
    expect((await as(member).post('/reports', { targetType: 'post', targetId: post.id, reason: 'Spam' })).statusCode).toBe(201);
    expect((await as(member).inject('DELETE', '/me', { confirm: 'DELETE' })).statusCode).toBe(200);
  });
});

describe('tokens', () => {
  it('earns no token for checking in on a commitment to your own request', async () => {
    const member = await createUser('Self');
    const post = await newRequest(member, 'Pray for my exam.');
    const c = (await as(member).post(`/posts/${post.id}/commitments`, { frequency: 'daily', vowText: 'I will pray' })).json().commitment;
    const before = await tokens.balanceOf(db, member);
    expect((await as(member).post(`/commitments/${c.id}/check-in`, {})).statusCode).toBe(200);
    expect(await tokens.balanceOf(db, member)).toBe(before);
  });
});

describe('moderation', () => {
  it('never shows removed content again when a second report on it is dismissed', async () => {
    const poster = await createUser('Poster');
    const a = await createUser('ReporterA');
    const b = await createUser('ReporterB');
    const moderator = await createUser('Mod');
    await grantRole(db, moderator, 'moderator', null);
    const post = await newRequest(poster, 'Buy my product at example.com');
    await as(a).post('/reports', { targetType: 'post', targetId: post.id, reason: 'Ad' });
    await as(b).post('/reports', { targetType: 'post', targetId: post.id, reason: 'Spam' });

    const items = (await as(moderator).get(`/moderation/queue?targetId=${post.id}`)).json().items;
    expect(items).toHaveLength(2);
    expect((await as(moderator).post(`/moderation/items/${items[0].id}/decision`, { action: 'remove', rule: 'ads' })).statusCode).toBe(200);
    // The other report was settled by the removal.
    expect((await as(moderator).get(`/moderation/queue?targetId=${post.id}`)).json().items).toHaveLength(0);

    // A report that arrives after the removal can be dismissed without restoring the post.
    const c = await createUser('ReporterC');
    await as(c).post('/reports', { targetType: 'post', targetId: post.id, reason: 'Still here?' });
    const late = (await as(moderator).get(`/moderation/queue?targetId=${post.id}`)).json().items[0];
    await as(moderator).post(`/moderation/items/${late.id}/decision`, { action: 'dismiss' });
    const { rows } = await db.query('select moderation_status from public.posts where id = $1', [post.id]);
    expect(rows[0].moderation_status).toBe('removed');
  });
});
