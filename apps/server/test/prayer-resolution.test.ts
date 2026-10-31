// Prayer resolution check-ins (Steve, 2026-10-31): "Has this prayer been answered?", the
// two-answer survey, repost or reword, the free broadcast token, and the radio lookup.
import type { JobHelpers } from 'graphile-worker';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as resolution from '../src/modules/resolution/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

const run = () => resolution.dueTask(db)({}, {} as JobHelpers);
const notices = async (userId: string) =>
  (await db.query<{ title: string; data: { postId: string } }>(`select title, data from public.notifications where user_id = $1 and kind = 'resolution'`, [userId])).rows;
const age = (postId: string, days: number) => db.query(`update public.posts set created_at = now() - make_interval(days => $2) where id = $1`, [postId, days]);
const priestly = async (userId: string) =>
  Number((await db.query<{ balance: string }>(`select balance from public.token_accounts where kind = 'user' and user_id = $1 and currency = 'priestly'`, [userId])).rows[0]?.balance ?? 0);

beforeAll(() => db.query('update public.resolution_settings set enabled = true, first_days = 14, again_days = 30, max_asks = 3, free_tokens = 1, free_token_every_days = 30'));
afterAll(() => db.end());

describe('Prayer resolution', () => {
  it('asks "Has this prayer been answered?" once the request is due, and only the author can answer', async () => {
    const [poster, other] = [await createUser('Resolution Poster'), await createUser('Resolution Other')];
    const post = await newRequest(poster);
    await run();
    expect(await notices(poster)).toEqual([]);
    await age(post.id, 15);
    await run();
    await run();
    const sent = await notices(poster);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ title: 'Has this prayer been answered?', data: { postId: post.id } });
    expect((await as(poster).get(`/posts/${post.id}/resolution`)).json()).toMatchObject({ enabled: true, pending: true, answered: null });
    expect((await as(other).get(`/posts/${post.id}/resolution`)).json()).toMatchObject({ pending: false });
    expect((await as(other).post(`/posts/${post.id}/resolution`, { answered: false })).statusCode).toBe(403);
    expect((await as(poster).post(`/posts/${post.id}/resolution`, { answered: true })).statusCode).toBe(400);
  });

  it('after "not yet": repost or reword, one free broadcast token, and asks again later', async () => {
    const poster = await createUser('Not Yet Poster');
    const post = await newRequest(poster, 'Please pray I find work this month.');
    await age(post.id, 15);
    await run();
    const r = await as(poster).post(`/posts/${post.id}/resolution`, { answered: false });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ pending: false, answered: false, canRepost: true, freeTokens: 1, tokenClaimed: false });

    const before = await priestly(poster);
    const t = await as(poster).post(`/posts/${post.id}/resolution/token`);
    expect(t.statusCode).toBe(200);
    expect(t.json().amount).toBe(1);
    expect(await priestly(poster)).toBe(before + 1);
    expect((await as(poster).post(`/posts/${post.id}/resolution/token`)).statusCode).toBe(400);

    // A second request within 30 days gets no second free token.
    const second = await newRequest(poster, 'Please pray for my sister too.');
    await age(second.id, 15);
    await run();
    expect((await as(poster).post(`/posts/${second.id}/resolution`, { answered: false })).json()).toMatchObject({ canRepost: true, freeTokens: 0 });

    // Asked again after again_days, while not reposted.
    await db.query(`update public.prayer_resolutions set next_ask_at = now() - interval '1 minute' where post_id = $1`, [second.id]);
    await run();
    expect((await notices(poster)).filter((n) => n.data.postId === second.id)).toHaveLength(2);

    const re = await as(poster).post(`/posts/${post.id}/resolution/repost`, { body: 'Please pray I find steady work soon.' });
    expect(re.statusCode).toBe(201);
    expect(re.json().post.body).toBe('Please pray I find steady work soon.');
    expect((await as(poster).post(`/posts/${post.id}/resolution/repost`, {})).statusCode).toBe(409);
    expect((await as(poster).get(`/posts/${post.id}/resolution`)).json()).toMatchObject({ canRepost: false, repostedPostId: re.json().post.id });
  });

  it('records the survey answer, marks the request answered, and looks up whether it went out by radio', async () => {
    const [poster, admin] = [await createUser('Answered Poster'), await createUser('Resolution Admin')];
    await grantRole(db, admin, 'admin', null);
    const first = await newRequest(poster, 'Please pray for my mother in hospital.');
    // The first request went out by radio, then was reposted; the repost is the one answered.
    await db.query(
      `insert into public.radio_prayers (post_id, user_id, cost, idempotency_key, status, transmitted_at) values ($1, $2, 0, $3, 'transmitted', now())`,
      [first.id, poster, `resolution-${first.id}`],
    );
    await age(first.id, 15);
    await run();
    await as(poster).post(`/posts/${first.id}/resolution`, { answered: false });
    const repost = (await as(poster).post(`/posts/${first.id}/resolution/repost`, {})).json().post as { id: string };
    await age(repost.id, 15);
    await run();
    const a = await as(poster).post(`/posts/${repost.id}/resolution`, { answered: true, outcome: 'his_will' });
    expect(a.statusCode).toBe(200);
    expect(a.json()).toMatchObject({ answered: true, outcome: 'his_will', pending: false });
    const { rows } = await db.query<{ state: string; prayercast: boolean; prayercast_count: number }>(
      `select p.state, r.prayercast, r.prayercast_count from public.posts p join public.prayer_resolutions r on r.post_id = p.id where p.id = $1`,
      [repost.id],
    );
    expect(rows[0]).toEqual({ state: 'answered', prayercast: true, prayercast_count: 1 });
    expect((await as(poster).post(`/posts/${repost.id}/resolution`, { answered: true, outcome: 'hoped' })).statusCode).toBe(409);

    const report = (await as(admin).get('/admin/resolution')).json();
    expect(report.answered.find((x: { postId: string }) => x.postId === repost.id)).toMatchObject({ who: 'Answered Poster', outcome: 'his_will', prayercast: true });
    expect(report.totals.answered_prayercast).toBeGreaterThan(0);
    expect((await as(poster).get('/admin/resolution')).statusCode).toBe(403);
  });

  it('is an Admin setting: timing can change, and off asks no one', async () => {
    const admin = await createUser('Resolution Settings Admin');
    await grantRole(db, admin, 'admin', null);
    const s = await as(admin).patch('/admin/resolution-settings', { firstDays: 7, againDays: 10 });
    expect(s.json().settings).toMatchObject({ enabled: true, first_days: 7, again_days: 10 });
    await as(admin).patch('/admin/resolution-settings', { enabled: false });
    const poster = await createUser('Switched Off Poster');
    const post = await newRequest(poster);
    await age(post.id, 8);
    await run();
    expect(await notices(poster)).toEqual([]);
    expect((await as(poster).get('/features')).json().features.prayerResolution).toBe(false);
    await as(admin).patch('/admin/resolution-settings', { enabled: true, firstDays: 14, againDays: 30 });
  });
});
