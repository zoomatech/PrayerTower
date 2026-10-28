import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as moderation from '../src/modules/moderation/index.js';
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

    const item = (await as(moderator).get(`/moderation/queue?targetId=${post.id}`)).json().items.find((i: { target_id: string }) => i.target_id === post.id);
    expect(item).toMatchObject({ source: 'crisis', reason: 'Someone may be in danger' });
    // Moderators hear about it at once (without what was written), and only once.
    const { rows: alerts } = await db.query(`select body, data from public.notifications where user_id = $1 and kind = 'crisis_flag' and data->>'itemId' = $2`, [moderator, item.id]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].body).not.toContain('die');
    expect((await db.query(`select 1 from public.notifications where user_id = $1 and kind = 'crisis_flag' and data->>'itemId' = $2`, [poster, item.id])).rows).toHaveLength(0);

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

describe('moderation notices and appeals', () => {
  it('tells the member which rule applied, lets a suspended member appeal once, and restores on overturn', async () => {
    const author = await createUser('Zealot');
    const reporter = await createUser('Reporter');
    const moderator = await createUser('Elder');
    await grantRole(db, moderator, 'moderator', null);
    const post = await newRequest(author, 'Lord, smite my enemies and their families.');
    await as(reporter).post('/reports', { targetType: 'post', targetId: post.id, reason: 'Harmful or abusive' });
    const { rows } = await db.query(`select id from public.moderation_items where target_id = $1 and source = 'report'`, [post.id]);
    const item = rows[0];
    await as(moderator).post(`/moderation/items/${item.id}/decision`, { action: 'remove', rule: 'harm', suspendDays: 3 });

    const notice = (await as(author).get('/me/notifications')).json().notifications.find((n: { kind: string }) => n.kind === 'moderation_notice');
    expect(notice.title).toBe('Your request was removed');
    expect(notice.body).toContain('Pray for good, never for harm');
    expect(notice.body).toContain('appeal');
    expect(notice.data).toMatchObject({ itemId: item.id, rule: 'harm', appealable: true });

    // Suspended: can't post, can appeal, only once, and only their own decisions.
    const blocked = await as(author).post('/posts', { postType: 'prayer_request', body: 'hi' });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().message).toMatch(/appeal/);
    expect((await as(reporter).post(`/moderation/items/${item.id}/appeal`, { message: 'Not me' })).statusCode).toBe(404);
    expect((await as(author).post(`/moderation/items/${item.id}/appeal`, { message: 'It was a psalm, not a threat.' })).statusCode).toBe(201);
    expect((await as(author).post(`/moderation/items/${item.id}/appeal`, { message: 'Again' })).statusCode).toBe(409);

    const appeal = (await as(moderator).get('/moderation/appeals')).json().appeals.find((a: { moderation_item_id: string }) => a.moderation_item_id === item.id);
    expect(appeal).toMatchObject({ rule: 'harm', message: 'It was a psalm, not a threat.' });
    expect(appeal.suspended_until).not.toBeNull();
    expect((await as(author).get('/moderation/appeals')).statusCode).toBe(403);

    await as(moderator).post(`/moderation/appeals/${appeal.id}/decision`, { action: 'overturn' });
    expect((await as(reporter).get(`/posts/${post.id}`)).statusCode).toBe(200);
    expect((await as(author).post('/posts', { postType: 'prayer_request', body: 'Thank you.' })).statusCode).toBe(201);
    const outcome = (await as(author).get('/me/notifications')).json().notifications.find((n: { kind: string }) => n.kind === 'appeal_decision');
    expect(outcome.title).toBe('Your appeal was accepted');
  });

  it('words a safe-messaging removal gently, with support and an invitation to repost', async () => {
    const notice = moderation.removalNotice('post', 'safe_messaging', 'x', null);
    expect(notice.body).toContain('988');
    expect(notice.body).toContain('welcome to post it again');
  });
});

describe('warn before posting', () => {
  it('warns only when the AI would flag the text, and never for self-harm', async () => {
    const u = await createUser('Writer');
    expect((await as(u).post('/moderation/precheck', { text: 'Praying for you.' })).json()).toEqual({ warn: false });
    setClassifier(async () => ({ flagged: true, categories: { harassment: true }, category_scores: { harassment: 0.9 } }));
    expect((await as(u).post('/moderation/precheck', { text: 'You are an idiot.' })).json()).toEqual({ warn: true });
    setClassifier(async () => ({ flagged: true, categories: { 'self-harm': true }, category_scores: { 'self-harm': 0.9 } }));
    expect((await as(u).post('/moderation/precheck', { text: 'I am hurting.' })).json()).toEqual({ warn: false });
    setClassifier(async () => {
      throw new Error('down');
    });
    expect((await as(u).post('/moderation/precheck', { text: 'Anything' })).json()).toEqual({ warn: false });
    setClassifier(async () => null);
  });
});
