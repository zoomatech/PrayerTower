// Kind norms (docs/KIND_NORMS.md): the kindness promise, the reminder on first
// replies, resting threads and "This helped", each off until an admin turns it on.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as kind from '../src/modules/kind-norms/index.js';
import { settings as practiceSettings } from '../src/modules/practices/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

const defaults = await kind.settings(db);
const practice = await practiceSettings(db);
const HOT = ['You are an idiot and you know it.', 'Shut up, you fool.', 'What a pathetic loser you are.'];
let admin: string;

beforeAll(async () => {
  admin = await createUser('Norms Admin');
  await grantRole(db, admin, 'admin', null);
});
afterAll(async () => {
  await kind.updateSettings(db, {
    promise: defaults.promise_enabled,
    promiseText: defaults.promise_text ?? '',
    replyReminder: defaults.reply_reminder_enabled,
    replyReminderCount: defaults.reply_reminder_count,
    resting: defaults.resting_enabled,
    restingHeated: defaults.resting_heated,
    restingWindowMinutes: defaults.resting_window_minutes,
    restingMinutes: defaults.resting_minutes,
    restingGapMinutes: defaults.resting_gap_minutes,
    appreciation: defaults.appreciation_enabled,
    offerSorry: defaults.offer_sorry_enabled,
  });
  await db.query('update public.practice_settings set mend_enabled = $1, ask_kindly_enabled = $2', [practice.mend_enabled, practice.ask_kindly_enabled]);
  await db.end();
});

describe('kind norms', () => {
  it('are all off by default, and only admins change them', async () => {
    expect(defaults).toMatchObject({ promise_enabled: false, reply_reminder_enabled: false, resting_enabled: false, appreciation_enabled: false });
    const m = await createUser('Norms Member');
    expect((await as(m).get('/me/kindness-promise')).json()).toEqual({ enabled: false, text: null, agreed: false });
    expect((await as(m).post('/me/kindness-promise')).statusCode).toBe(400);
    expect((await as(m).patch('/admin/kind-norms', { promise: true })).statusCode).toBe(403);
    expect((await as(admin).patch('/admin/kind-norms', { promise: true, promiseText: 'Be gentle here.' })).json().settings).toMatchObject({ promise_enabled: true, promise_text: 'Be gentle here.' });
    expect((await as(admin).patch('/admin/kind-norms', { promiseText: '' })).json().settings.promise_text).toBeNull();
  });

  it('keeps a member’s promise once, and shows the reminder only on their first replies', async () => {
    await kind.updateSettings(db, { promise: true, replyReminder: true, replyReminderCount: 2 });
    const m = await createUser('Promise Keeper');
    expect((await as(m).get('/me/kindness-promise')).json()).toEqual({ enabled: true, text: null, agreed: false });
    await as(m).post('/me/kindness-promise');
    await as(m).post('/me/kindness-promise');
    expect((await as(m).get('/me/kindness-promise')).json().agreed).toBe(true);

    const post = await newRequest(admin);
    expect((await as(m).get(`/posts/${post.id}/reply-box`)).json()).toEqual({ reminder: true, resting: null });
    await as(m).post(`/posts/${post.id}/comments`, { body: 'Praying with you.' });
    await as(m).post(`/posts/${post.id}/comments`, { body: 'Still praying today.' });
    expect((await as(m).get(`/posts/${post.id}/reply-box`)).json().reminder).toBe(false);
  });

  it('rests a heated thread: replies are spaced out, never refused for good, and calm threads are left alone', async () => {
    await kind.updateSettings(db, { resting: true, restingHeated: 3, restingGapMinutes: 10 });
    const poster = await createUser('Rest Poster');
    const post = await newRequest(poster);
    const calm = await newRequest(poster, 'Please pray for my job interview on Friday.');
    const people = [await createUser('Rest A'), await createUser('Rest B'), await createUser('Rest C')];
    for (const [i, p] of people.entries()) {
      const r = await as(p).post(`/posts/${post.id}/comments`, { body: HOT[i] });
      expect(r.statusCode).toBe(201);
      expect(r.json().resting).toBe(i === 2 ? true : undefined);
    }
    const box = (await as(poster).get(`/posts/${post.id}/reply-box`)).json();
    expect(box.resting).toMatchObject({ gapMinutes: 10 });
    // Someone who just replied waits; someone who hasn't replied yet may.
    const again = await as(people[0]!).post(`/posts/${post.id}/comments`, { body: 'One more thought.' });
    expect(again.statusCode).toBe(429);
    expect(again.json()).toMatchObject({ error: 'resting', message: expect.stringMatching(/^This conversation is resting for a moment\. You can reply again in \d+ minutes?\.$/) });
    expect((await as(poster).post(`/posts/${post.id}/comments`, { body: 'Let us all take a breath.' })).statusCode).toBe(201);
    // Once the gap has passed, they can reply again.
    await db.query(`update public.comments set created_at = now() - interval '11 minutes' where post_id = $1 and user_id = $2`, [post.id, people[0]]);
    expect((await as(people[0]!).post(`/posts/${post.id}/comments`, { body: 'Sorry, everyone.' })).statusCode).toBe(201);
    // Other threads are not affected.
    expect((await as(people[0]!).get(`/posts/${calm.id}/reply-box`)).json().resting).toBeNull();
    // Nothing is hidden.
    expect((await as(poster).get(`/posts/${post.id}/comments`)).json().comments).toHaveLength(5);
    // Words are never kept, only when.
    const { rows } = await db.query(`select * from public.thread_heat where post_id = $1`, [post.id]);
    expect(Object.keys(rows[0])).toEqual(['id', 'post_id', 'created_at']);
    await kind.updateSettings(db, { resting: false });
    expect((await as(people[0]!).post(`/posts/${post.id}/comments`, { body: 'And another.' })).statusCode).toBe(201);
  });

  it('orders comments by how widely they helped, not how many tapped', async () => {
    await kind.updateSettings(db, { appreciation: true });
    const poster = await createUser('Helped Poster');
    const post = await newRequest(poster);
    const [w1, w2] = [await createUser('Writer One'), await createUser('Writer Two')];
    const c1 = (await as(w1).post(`/posts/${post.id}/comments`, { body: 'Praying for you every morning.' })).json().comment.id;
    const c2 = (await as(w2).post(`/posts/${post.id}/comments`, { body: 'I went through this too. You are not alone.' })).json().comment.id;
    const reply = (await as(w1).post(`/posts/${post.id}/comments`, { body: 'Same here.', parentId: c1 })).json().comment.id;
    // Three neighbours from one town tap the first; two people from different towns, one new and one long-time, tap the second.
    for (const n of ['Same Town 1', 'Same Town 2', 'Same Town 3']) {
      const u = await createUser(n);
      await db.query(`update public.profiles set town = 'Tulsa', created_at = now() - interval '400 days' where id = $1`, [u]);
      expect((await as(u).put(`/comments/${c1}/helped`, { on: true })).json()).toEqual({ helped: true });
    }
    const far = await createUser('Far Away');
    await db.query(`update public.profiles set town = 'Dearborn', created_at = now() - interval '400 days' where id = $1`, [far]);
    const fresh = await createUser('Brand New');
    await db.query(`update public.profiles set town = 'Karachi' where id = $1`, [fresh]);
    await as(far).put(`/comments/${c2}/helped`, { on: true });
    await as(fresh).put(`/comments/${c2}/helped`, { on: true });

    const list = (await as(far).get(`/posts/${post.id}/comments`)).json().comments;
    expect(list.map((c: { id: string }) => c.id)).toEqual([c2, c1, reply]);
    expect(list[0]).toMatchObject({ helped: true, widelyAppreciated: true });
    expect(list[1]).toMatchObject({ helped: false, widelyAppreciated: false });
    // Not your own comment; and it can be taken back.
    expect((await as(w1).put(`/comments/${c1}/helped`, { on: true })).statusCode).toBe(403);
    await as(far).put(`/comments/${c2}/helped`, { on: false });
    expect((await as(far).get(`/posts/${post.id}/comments`)).json().comments[0].helped).toBe(false);

    await kind.updateSettings(db, { appreciation: false });
    expect((await as(far).get(`/posts/${post.id}/comments`)).json().comments.map((c: { id: string }) => c.id)).toEqual([c1, reply, c2]);
    expect((await as(far).put(`/comments/${c2}/helped`, { on: true })).statusCode).toBe(400);
  });

  it('lets an author offer a private sorry to whoever sent a gentle note, through a moderator', async () => {
    await db.query('update public.practice_settings set mend_enabled = true, ask_kindly_enabled = true');
    const poster = await createUser('Sorry Poster');
    const author = await createUser('Sorry Author');
    const post = await newRequest(poster);
    const c = (await as(author).post(`/posts/${post.id}/comments`, { body: 'Everything happens for a reason.' })).json().comment.id;
    await kind.updateSettings(db, { offerSorry: false });
    expect((await as(author).get(`/comments/${c}/sorry-offer`)).json()).toEqual({ available: false, mendId: null });
    await kind.updateSettings(db, { offerSorry: true });
    // Nobody sent a note yet.
    expect((await as(author).get(`/comments/${c}/sorry-offer`)).json().available).toBe(false);
    expect((await as(poster).post(`/comments/${c}/ask-kindly`, { reason: 'grief' })).statusCode).toBe(200);
    // Only the author can offer.
    expect((await as(poster).get(`/comments/${c}/sorry-offer`)).json().available).toBe(false);
    expect((await as(poster).post(`/comments/${c}/sorry-offer`)).statusCode).toBe(404);
    expect((await as(author).get(`/comments/${c}/sorry-offer`)).json()).toEqual({ available: true, mendId: null });

    const { mendId } = (await as(author).post(`/comments/${c}/sorry-offer`)).json();
    expect((await as(author).get(`/comments/${c}/sorry-offer`)).json()).toEqual({ available: false, mendId });
    // The author never sees who it goes to; the usual Mend steps follow.
    const view = (await as(author).get(`/mends/${mendId}`)).json().mend;
    expect(view).toMatchObject({ role: 'author', status: 'invited', author: null });
    expect(JSON.stringify(view)).not.toContain(poster);
    await as(author).put(`/mends/${mendId}/sorry`, { whatIDid: 'I brushed off your grief.', onMe: 'That was on me.', nextTime: 'I will listen first.' });
    expect((await as(poster).get(`/mends/${mendId}`)).json().mend).toMatchObject({ role: 'hurt', status: 'review', sorry: null });
    expect((await as(admin).post(`/moderation/mends/${mendId}`, { approve: true })).json()).toEqual({ status: 'delivered' });
    expect((await as(poster).get(`/mends/${mendId}`)).json().mend).toMatchObject({ status: 'delivered', sorry: { onMe: 'That was on me.' } });
    // Nothing more to offer, and none while Mend is off.
    expect((await as(author).post(`/comments/${c}/sorry-offer`)).statusCode).toBe(404);
    await db.query('update public.practice_settings set mend_enabled = false');
    expect((await as(author).post(`/comments/${c}/sorry-offer`)).statusCode).toBe(400);
  });
});
