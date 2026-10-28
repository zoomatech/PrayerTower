// Abuse tests: scripted spam, flooding and token-farming attempts against the
// API, each with the defense that stops it. docs/ABUSE_TESTS.md lists what
// each attack tried, what got through before, and the fix.
import { afterAll, describe, expect, it } from 'vitest';
import { awardBonus, balanceOf } from '../src/modules/tokens/index.js';
import { as, createUser, db, drainJobs } from './helpers.js';

afterAll(() => db.end());

/** An established member: old enough and active enough that new-member limits don't apply. */
async function member(name: string) {
  const id = await createUser(name);
  await db.query(`update public.profiles set created_at = now() - interval '30 days', onboarded_at = now() - interval '30 days' where id = $1`, [id]);
  return id;
}
/** n past times 61 seconds apart, all inside one UTC day (yesterday if today is too young). */
function spaced(n: number): Date[] {
  const midnight = new Date().setUTCHours(0, 0, 0, 0);
  const start = Date.now() - midnight > (n + 2) * 61_000 ? midnight + 60_000 : midnight - 86_400_000 + 60_000;
  return Array.from({ length: n }, (_, i) => new Date(start + i * 61_000));
}
const post = async (userId: string, body: string) => as(userId).post('/posts', { postType: 'prayer_request', body });

describe('abuse: spam and flooding', () => {
  it('stops a member posting request after request (spam script)', async () => {
    const spammer = await member('Spam Script');
    const codes: number[] = [];
    for (let i = 0; i < 15; i++) codes.push((await post(spammer, `Please pray for my business number ${i}, it needs customers this week.`)).statusCode);
    // 10 an hour by default, then 429.
    expect(codes.filter((c) => c === 201)).toHaveLength(10);
    expect(codes.slice(10)).toEqual([429, 429, 429, 429, 429]);
    const r = await post(spammer, 'One more for good measure, please pray.');
    expect(r.json()).toMatchObject({ error: 'slow_down' });
  });

  it('refuses the same request posted twice in a day, however it is spaced or cased', async () => {
    const m = await member('Copy Paste');
    expect((await post(m, 'Pray for revival in our town this week.')).statusCode).toBe(201);
    const again = await post(m, '  PRAY FOR REVIVAL IN OUR TOWN THIS WEEK.  ');
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe('duplicate');
    // Someone else may still post the same words.
    expect((await post(await member('Other Person'), 'Pray for revival in our town this week.')).statusCode).toBe(201);
  });

  it('stops comment floods and repeated comments on a request', async () => {
    const poster = await member('Comment Target');
    const flooder = await member('Comment Flooder');
    const id = (await post(poster, 'Pray for my exams next week.')).json().post.id;
    // 60 an hour by default (settings are shared by tests running in parallel, so this uses the default).
    const codes: number[] = [];
    for (let i = 0; i < 62; i++) codes.push((await as(flooder).post(`/posts/${id}/comments`, { body: `Praying, friend (${i})` })).statusCode);
    expect(codes.filter((c) => c === 201)).toHaveLength(60);
    expect(codes.slice(60)).toEqual([429, 429]);
    const repeater = await member('Comment Repeater');
    expect((await as(repeater).post(`/posts/${id}/comments`, { body: 'Visit my page for blessings' })).statusCode).toBe(201);
    expect((await as(repeater).post(`/posts/${id}/comments`, { body: 'Visit my page for blessings' })).statusCode).toBe(409);
  });

  it('stops a message flood in a conversation', async () => {
    const a = await member('Message Flooder');
    const b = await member('Message Target');
    await as(a).put(`/people/${b}/follow`);
    await as(b).put(`/people/${a}/follow`);
    const start = await as(a).post('/conversations/direct', { userId: b, body: 'Hello, may I pray with you?' });
    expect(start.statusCode, start.body).toBe(201);
    const convo = start.json().conversationId;
    // The other person accepts, so only the flood limit applies.
    await as(b).post(`/conversations/${convo}/accept`);
    const codes: number[] = [];
    for (let i = 0; i < 25; i++) codes.push((await as(a).post(`/conversations/${convo}/messages`, { body: `Message ${i}` })).statusCode);
    // 20 a minute, counting the first one.
    expect(codes.filter((c) => c === 201)).toHaveLength(19);
    expect(codes.at(-1)).toBe(429);
  });

  it('counts one report per member per item, however many times they report it', async () => {
    const poster = await member('Reported Poster');
    const reporter = await member('Mass Reporter');
    const id = (await post(poster, 'Pray for my neighbor who is ill.')).json().post.id;
    for (let i = 0; i < 10; i++) await as(reporter).post('/reports', { targetType: 'post', targetId: id, reason: 'spam' });
    const { rows } = await db.query(`select 1 from public.moderation_items where target_id = $1 and source = 'report'`, [id]);
    expect(rows).toHaveLength(1);
  });

  it('leaves staff free to post announcements-style bursts', async () => {
    const mod = await member('Busy Moderator');
    await db.query(`insert into public.user_roles (user_id, role) values ($1, 'moderator')`, [mod]);
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await post(mod, `Staff note ${i}: please pray for the pilot.`)).statusCode);
    expect(codes.every((c) => c === 201)).toBe(true);
  });
});

describe('abuse: token farming', () => {
  it('earns one regular token per request per day, however often a script taps "praying now"', async () => {
    const poster = await member('Farm Target');
    const farmer = await member('Tap Script');
    const id = (await post(poster, 'Pray for rain for our crops.')).json().post.id;
    for (let i = 0; i < 20; i++) await as(farmer).post(`/posts/${id}/praying-now`, { durationSeconds: 5 });
    await drainJobs();
    expect(await balanceOf(db, farmer)).toBe(1);
    // The poster can't farm their own request.
    for (let i = 0; i < 5; i++) await as(poster).post(`/posts/${id}/praying-now`, {});
    await drainJobs();
    expect(await balanceOf(db, poster)).toBe(0);
  });

  it('counts one verified prayer per request per day toward Priestly tokens, even when taps are spaced past the minimum gap', async () => {
    const poster = await member('Priestly Target');
    const farmer = await member('Spaced Tap Script');
    const id = (await post(poster, 'Pray for our church building fund.')).json().post.id;
    // A script that taps the same request every 61 seconds for an hour.
    for (const at of spaced(60))
      await db.query(`insert into public.prayer_events (post_id, user_id, kind, created_at) values ($1, $2, 'praying_now', $3)`, [id, farmer, at]);
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.prayer_events where user_id = $1 and verified`, [farmer]);
    expect(rows[0]!.n).toBe(1);
  });

  it('caps verified prayers a day, so a ring of accounts praying for each other earns little', async () => {
    const farmer = await member('Ring Farmer');
    const ring = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => member(`Ring Poster ${n}`)));
    const posts: string[] = [];
    for (const r of ring) for (let i = 0; i < 10; i++) posts.push((await post(r, `Ring request ${i} from ${r.slice(0, 8)}: pray for work.`)).json().post.id);
    // 60 different requests, each prayed for once, 61 seconds apart, all on one day.
    const times = spaced(posts.length);
    for (const [i, p] of posts.entries())
      await db.query(`insert into public.prayer_events (post_id, user_id, kind, created_at) values ($1, $2, 'praying_now', $3)`, [p, farmer, times[i]]);
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.prayer_events where user_id = $1 and verified`, [farmer]);
    // 50 a day by default (token_settings.verified_prayers_per_day), so at most 5 Priestly tokens a day.
    expect(rows[0]!.n).toBe(50);
  });

  it('never lets parallel gifts spend more than the balance, or a replayed request pay twice', async () => {
    const giver = await member('Double Spender');
    const friend = await member('Gift Friend');
    await awardBonus(db, giver, `abuse-test-${giver}`, 3);
    const attempts = await Promise.all(
      Array.from({ length: 10 }, (_, i) => as(giver).post('/tokens/gift', { toUserId: friend, amount: 1, idempotencyKey: `parallel-${i}` })),
    );
    expect(attempts.filter((r) => r.statusCode === 200)).toHaveLength(3);
    expect(await balanceOf(db, giver)).toBe(0);
    expect(await balanceOf(db, friend)).toBe(3);
    // The same request sent again (a replay) doesn't move tokens twice.
    await awardBonus(db, giver, `abuse-test-2-${giver}`, 2);
    const once = await as(giver).post('/tokens/gift', { toUserId: friend, amount: 1, idempotencyKey: 'replay' });
    const twice = await as(giver).post('/tokens/gift', { toUserId: friend, amount: 1, idempotencyKey: 'replay' });
    expect([once.statusCode, twice.statusCode]).toEqual([200, 200]);
    expect(await balanceOf(db, giver)).toBe(1);
    // Self-gifts, negative and fractional amounts are refused.
    expect((await as(giver).post('/tokens/gift', { toUserId: giver, amount: 1, idempotencyKey: 'self' })).statusCode).toBe(400);
    expect((await as(giver).post('/tokens/gift', { toUserId: friend, amount: -5, idempotencyKey: 'neg' })).statusCode).toBe(400);
    expect((await as(giver).post('/tokens/gift', { toUserId: friend, amount: 0.5, idempotencyKey: 'frac' })).statusCode).toBe(400);
  });
});
