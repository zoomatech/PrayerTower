import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as prompts from '../src/modules/prompts/index.js';
import { isoWeek, tierFor, type TierSetting } from '../src/modules/tiers/index.js';
import * as tokens from '../src/modules/tokens/index.js';
import { as, createUser, db, drainJobs, newRequest } from './helpers.js';

afterAll(async () => {
  // Tier settings are global; leave them unset for other test files.
  await db.query('update public.tier_settings set min_prayer_events = null, weekly_allotment = null');
  await db.end();
});

const setting = (tier: string, rank: number, min: number | null, allot: number | null = null): TierSetting => ({
  tier,
  rank,
  min_prayer_events: min,
  weekly_allotment: allot,
  label: tier,
});

describe('tiers', () => {
  it('starts everyone at the first tier and climbs only through configured thresholds', () => {
    const unset = [setting('scout', 1, null), setting('helper', 2, null), setting('warrior', 3, null)];
    expect(tierFor(500, unset)!.tier).toBe('scout');
    const set = [setting('scout', 1, 0), setting('helper', 2, 10), setting('warrior', 3, 50)];
    expect(tierFor(9, set)!.tier).toBe('scout');
    expect(tierFor(10, set)!.tier).toBe('helper');
    expect(tierFor(50, set)!.tier).toBe('warrior');
  });

  it('labels ISO weeks', () => {
    expect(isoWeek(new Date('2026-10-25T12:00:00Z'))).toBe('2026-W43');
    expect(isoWeek(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53');
  });

  it('lets admins configure tiers, shows tier icons, and keeps anonymous members on a private track', async () => {
    const admin = await createUser('Admin');
    const member = await createUser('Member');
    const secret = await createUser('Secret');
    const poster = await createUser('Poster');
    await grantRole(db, admin, 'admin', null);
    await as(secret).patch('/me', { anonymousByDefault: true });

    expect((await as(member).patch('/admin/tiers/prayerful_helper', { minPrayerEvents: 2 })).statusCode).toBe(403);
    expect((await as(admin).patch('/admin/tiers/prayerful_helper', { minPrayerEvents: 2, weeklyAllotment: 5 })).statusCode).toBe(200);
    const bad = await as(admin).patch('/admin/tiers/prayer_warrior', { minPrayerEvents: 1 });
    expect(bad.statusCode).toBe(400);
    const { tiers } = (await as(admin).get('/admin/tiers')).json();
    expect(tiers.find((t: { tier: string }) => t.tier === 'prayer_warrior').min_prayer_events).toBeNull();

    const request = await newRequest(poster);
    for (const u of [member, secret]) {
      await as(u).post(`/posts/${request.id}/praying-now`);
      await as(u).post(`/posts/${request.id}/praying-now`);
    }
    expect((await as(member).get('/me/tier')).json().tier.tier).toBe('prayerful_helper');
    expect((await as(secret).get('/me/tier')).json().tier.tier).toBe('prayerful_helper');

    const mine = await newRequest(member, 'Pray for my exams.');
    const theirs = await newRequest(secret, 'Pray for my marriage.');
    expect((await as(poster).get(`/posts/${mine.id}`)).json().post.author.tier).toBe('prayerful_helper');
    expect((await as(poster).get(`/posts/${theirs.id}`)).json().post.author.tier).toBeNull();
    expect((await as(secret).get(`/posts/${theirs.id}`)).json().post.author.tier).toBe('prayerful_helper');
  });

  it('resupplies tokens weekly by tier, once per week', async () => {
    const u = await createUser('Resupplied');
    await db.query('update public.tier_settings set weekly_allotment = 3 where tier = $1', ['prayer_scout']);
    await db.query(`select graphile_worker.add_job('tiers_weekly_resupply', '{}')`);
    await drainJobs();
    await db.query(`select graphile_worker.add_job('tiers_weekly_resupply', '{}')`);
    await drainJobs();
    expect(await tokens.balanceOf(db, u)).toBe(3);
    await db.query('update public.tier_settings set weekly_allotment = null');
  });
});

describe('prayer prompts', () => {
  it('asks about the commitment gone longest without prayer, then respects the cap', async () => {
    const poster = await createUser('Luis');
    const ethel = await createUser('Ethel');
    const post = await newRequest(poster);
    const { commitment } = (await as(ethel).post(`/posts/${post.id}/commitments`, { frequency: 'daily', vowText: 'Daily for Luis' })).json();
    await db.query(`update public.commitments set created_at = now() - interval '2 days' where id = $1`, [commitment.id]);

    const first = (await as(ethel).get('/me/prompt')).json().prompt;
    expect(first).toMatchObject({ postId: post.id, commitmentId: commitment.id, question: 'When was the last time you prayed for Luis?' });
    expect((await as(ethel).get('/me/prompt')).json().prompt).toBeNull();

    const res = await as(ethel).post(`/me/prompts/${first.id}/response`, { response: 'prayed' });
    expect(res.json().recorded).toBe(true);
    const list = (await as(ethel).get('/me/commitments')).json().commitments;
    expect(list[0].completed_count).toBe(1);
    expect((await as(ethel).post(`/me/prompts/${first.id}/response`, { response: 'prayed' })).statusCode).toBe(400);
  });

  it('suggests an unprayed request from someone followed, caps per day, and can be turned off', async () => {
    const friend = await createUser('Marta');
    const me = await createUser('Me');
    await as(me).put(`/people/${friend}/follow`);
    const post = await newRequest(friend, 'Pray for my mother.');

    const t0 = new Date(Date.now() + 60_000);
    const p1 = await prompts.next(db, me, t0);
    expect(p1).toMatchObject({ postId: post.id, commitmentId: null, question: 'Would you pray for Marta today?' });
    // The same post is not repeated within three days, so nothing else to ask.
    expect(await prompts.next(db, me, new Date(t0.getTime() + 13 * 3_600_000))).toBeNull();

    await as(me).patch('/me', { promptsEnabled: false });
    await newRequest(friend, 'Another request.');
    expect(await prompts.next(db, me, new Date(t0.getTime() + 13 * 3_600_000))).toBeNull();
  });
});

describe('weekly review and pilot metrics', () => {
  it('frames the week positively', async () => {
    const poster = await createUser('R');
    const u = await createUser('Reviewer');
    const post = await newRequest(poster);
    const quiet = (await as(u).get('/me/commitments/review')).json();
    expect(quiet.message).toMatch(/When you are ready/);
    await as(u).post(`/posts/${post.id}/commitments`, { frequency: 'weekly', vowText: 'Weekly' });
    expect((await as(u).get('/me/commitments/review')).json().message).toMatch(/WE DO NOT JUDGE/);
    await as(u).post(`/posts/${post.id}/praying-now`);
    expect((await as(u).get('/me/commitments/review')).json().message).toBe(
      'This week you prayed 1 time for 1 request. Thank you for standing with them.',
    );
  });

  it('reports pilot metrics to admins only, and admins manage roles', async () => {
    const admin = await createUser('Admin2');
    const member = await createUser('Volunteer');
    await grantRole(db, admin, 'admin', null);
    expect((await as(member).get('/admin/metrics')).statusCode).toBe(403);
    const m = (await as(admin).get('/admin/metrics?days=30')).json();
    expect(m.posts.requests).toBeGreaterThan(0);
    expect(m.prayer.praying_now_taps).toBeGreaterThan(0);
    expect(m.commitments).toHaveProperty('prayers_completed');
    expect(m.tokens).toHaveProperty('earned');
    expect(m.moderation).toHaveProperty('pending');

    const granted = await as(admin).put(`/admin/people/${member}/roles/moderator`);
    expect(granted.json().roles).toEqual(['moderator']);
    expect((await as(member).get('/moderation/queue')).statusCode).toBe(200);
    expect((await as(admin).put(`/admin/people/${member}/roles/king`)).statusCode).toBe(400);

    const weekly = (await as(admin).get('/admin/pilot-report?weeks=4')).json().weeks;
    expect(weekly).toHaveLength(4);
    expect(weekly.at(-1).requests_posted).toBeGreaterThan(0);
    const csv = await as(admin).get('/admin/pilot-report?weeks=2&format=csv');
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.body.split('\n')[0]).toBe(
      'week_start,new_members,requests_posted,prayers_answered,praying_now_taps,active_pray_ers,commitments_made,commitment_checkins,encouragements,moderation_items,removals',
    );
    expect((await as(member).get('/admin/pilot-report')).statusCode).toBe(403);
    const found = (await as(admin).get('/admin/people?q=volunt')).json().people;
    expect(found.map((p: { id: string }) => p.id)).toContain(member);
    expect(found.find((p: { id: string }) => p.id === member).roles).toEqual(['moderator']);
    expect((await as(member).get('/admin/people?q=a')).statusCode).toBe(403);
  });
});
