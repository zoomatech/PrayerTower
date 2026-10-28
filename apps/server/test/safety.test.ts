import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as safety from '../src/modules/safety/index.js';
import * as tokens from '../src/modules/tokens/index.js';
import { as, createUser, db, drainJobs, newRequest, setClassifier } from './helpers.js';

const tokenDefaults = await tokens.settings(db);
afterAll(async () => {
  await safety.updateSettings(db, { new_member_limits_enabled: true, new_member_hours: 24, new_member_min_prayers: 5, new_member_posts_per_day: 3 });
  await tokens.updateSettings(db, tokenDefaults);
  setClassifier(async () => null);
  await db.end();
});

describe('safe messaging', () => {
  it('keeps a crisis request up, flags it for a person, and holds amplification until reviewed', async () => {
    const poster = await createUser('Hurting');
    const moderator = await createUser('Shepherd');
    await grantRole(db, moderator, 'moderator', null);
    await tokens.updateSettings(db, { radio_funding: 'free' });

    const res = await as(poster).post('/posts', { postType: 'prayer_request', body: 'Some nights I want to die. Please pray for me.' });
    expect(res.statusCode).toBe(201);
    const post = res.json().post;
    expect(post.crisis).toBe(true);
    expect((await as(moderator).get(`/posts/${post.id}`)).json().post.crisis).toBe(true);

    const item = (await as(moderator).get('/moderation/queue')).json().items.find((i: { target_id: string }) => i.target_id === post.id);
    expect(item).toMatchObject({ source: 'crisis', reason: 'Someone may be in danger' });

    expect((await as(poster).post(`/posts/${post.id}/radio`, { idempotencyKey: 'crisis-1' })).statusCode).toBe(409);
    await as(moderator).post(`/moderation/items/${item.id}/decision`, { action: 'dismiss', note: 'Reached out; safe.' });
    expect((await as(poster).post(`/posts/${post.id}/radio`, { idempotencyKey: 'crisis-2' })).statusCode).toBe(201);

    const plain = await newRequest(poster, 'Pray for my job interview.');
    expect(plain.crisis).toBe(false);
  });

  it('flags crisis comments, and posts the AI rates as self-harm', async () => {
    const author = await createUser('Author');
    const friend = await createUser('Friend');
    const post = await newRequest(author, 'Pray for my week.');
    const c = (await as(friend).post(`/posts/${post.id}/comments`, { body: 'I have been hurting myself again.' })).json().comment;
    expect(c.crisis).toBe(true);

    setClassifier(async () => ({ flagged: true, categories: { 'self-harm/intent': true }, category_scores: { 'self-harm/intent': 0.9 } }));
    const quiet = await newRequest(author, 'I feel like everyone would be better off without me.');
    expect(quiet.crisis).toBe(false);
    await drainJobs();
    setClassifier(async () => null);
    const { rows } = await db.query('select crisis, moderation_status from public.posts where id = $1', [quiet.id]);
    expect(rows[0]).toEqual({ crisis: true, moderation_status: 'visible' });
  });
});

describe('new-member limits', () => {
  it('limits new members until they have prayed for others, and exempts staff', async () => {
    const admin = await createUser('Keeper');
    await grantRole(db, admin, 'admin', null);
    const s = await as(admin).patch('/admin/safety-settings', { newMemberLimitsEnabled: true, newMemberHours: 0, newMemberPostsPerDay: 2, newMemberMinPrayers: 5 });
    expect(s.json().settings).toMatchObject({ new_member_limits_enabled: true, new_member_posts_per_day: 2, new_member_links_allowed: false });

    const fresh = await createUser('Newcomer');
    const friend = await createUser('Friend');
    await as(fresh).put(`/people/${friend}/follow`);
    expect((await as(fresh).post('/posts', { postType: 'prayer_request', body: 'Pray, and visit www.example.com' })).statusCode).toBe(403);
    expect((await as(fresh).post('/posts', { postType: 'prayer_request', body: 'Pray for rain.' })).statusCode).toBe(201);
    const second = (await as(fresh).post('/posts', { postType: 'prayer_request', body: 'Pray for peace.' })).json().post;
    const third = await as(fresh).post('/posts', { postType: 'prayer_request', body: 'Pray for my town.' });
    expect(third.statusCode).toBe(429);
    expect(third.json().message).toMatch(/2 requests a day/);
    expect((await as(fresh).post(`/posts/${second.id}/ask`, { recipientIds: [friend] })).statusCode).toBe(403);

    // Praying for five other people's requests lifts the limits.
    for (let i = 0; i < 5; i++) {
      const other = await newRequest(admin, `Request ${i}`);
      await as(fresh).post(`/posts/${other.id}/praying-now`);
    }
    expect((await as(fresh).post('/posts', { postType: 'prayer_request', body: 'Pray for my town.' })).statusCode).toBe(201);
    expect((await as(fresh).post(`/posts/${second.id}/ask`, { recipientIds: [friend] })).statusCode).toBe(200);

    // Waiting period: a brand-new account is limited however much it has prayed.
    await as(admin).patch('/admin/safety-settings', { newMemberHours: 24, newMemberMinPrayers: 0 });
    const brandNew = await createUser('Brand New');
    expect((await as(brandNew).post('/posts', { postType: 'prayer_request', body: 'See https://spam.example' })).statusCode).toBe(403);
    expect((await as(admin).post('/posts', { postType: 'prayer_request', body: 'Admins can link: https://prayertower.app' })).statusCode).toBe(201);
  });
});
