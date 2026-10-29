// Routes no other test reached: staff settings and reports, the Live Amplifier
// while it is off, who I follow, and taking back a witness story.
import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(async () => {
  await db.end();
});

const uuid = '00000000-0000-4000-8000-000000000000';

describe('staff settings and reports', () => {
  it('activity settings: admins only, checked, saved', async () => {
    const admin = await createUser('Activity Admin');
    const member = await createUser('Activity Member');
    await grantRole(db, admin, 'admin', null);
    expect((await as(member).get('/admin/activity-settings')).statusCode).toBe(403);
    expect((await as(member).patch('/admin/activity-settings', { maxPrayersPerHour: 50 })).statusCode).toBe(403);
    const before = (await as(admin).get('/admin/activity-settings')).json().settings;
    expect(before).toHaveProperty('max_prayers_per_hour');
    expect((await as(admin).patch('/admin/activity-settings', { maxPrayersPerHour: 1 })).statusCode).toBe(400);
    try {
      const res = await as(admin).patch('/admin/activity-settings', { maxPrayersPerHour: before.max_prayers_per_hour + 1 });
      expect(res.json().settings.max_prayers_per_hour).toBe(before.max_prayers_per_hour + 1);
    } finally {
      await as(admin).patch('/admin/activity-settings', { maxPrayersPerHour: before.max_prayers_per_hour });
    }
  });

  it('feedback summary and harm counts: admins only', async () => {
    const admin = await createUser('Report Admin');
    const member = await createUser('Report Member');
    await grantRole(db, admin, 'admin', null);
    expect((await as(member).get('/admin/feedback-summary')).statusCode).toBe(403);
    expect((await as(admin).get('/admin/feedback-summary')).json()).toHaveProperty('summary');
    expect((await as(member).get('/admin/harm-metrics')).statusCode).toBe(403);
    expect((await as(admin).get('/admin/harm-metrics?days=0')).statusCode).toBe(400);
    expect((await as(admin).get('/admin/harm-metrics?days=7')).json()).toHaveProperty('counts');
  });
});

describe('Live Amplifier readings while off', () => {
  it('lists nothing, and refuses a claim or a read', async () => {
    const member = await createUser('Amp Off Member');
    expect((await as(member).get('/amplifier/readings')).json()).toEqual({ readings: [] });
    expect((await as(member).post('/amplifier/readings', {})).statusCode).toBe(400);
    expect((await as(member).post('/amplifier/readings', { radioPrayerId: uuid })).statusCode).toBe(403);
    expect((await as(member).post(`/amplifier/readings/${uuid}/read`, {})).statusCode).toBe(403);
    expect((await as(member).post(`/amplifier/readings/${uuid}/release`, {})).statusCode).toBe(404);
    expect((await as(member).post('/amplifier/readings/not-an-id/release', {})).statusCode).toBe(400);
  });
});

describe('who I follow', () => {
  it('lists the people I follow, newest first, and drops an unfollow', async () => {
    const me = await createUser('Follower Fay');
    const a = await createUser('Followed Al');
    const b = await createUser('Followed Bea');
    expect((await as(me).get('/me/following')).json()).toEqual({ people: [] });
    await as(me).put(`/people/${a}/follow`);
    await as(me).put(`/people/${b}/follow`);
    expect((await as(me).get('/me/following')).json().people.map((p: { id: string }) => p.id)).toEqual([b, a]);
    await as(me).delete(`/people/${a}/follow`);
    expect((await as(me).get('/me/following')).json().people.map((p: { id: string }) => p.id)).toEqual([b]);
  });
});

describe('taking back a witness story', () => {
  it('lets the author or a moderator withdraw it, but not another witness', async () => {
    const [author, other, moderator, helped, member] = [
      await createUser('Story Author'),
      await createUser('Other Witness'),
      await createUser('Story Moderator'),
      await createUser('Story Helped'),
      await createUser('Story Member'),
    ];
    await grantRole(db, author, 'witness', null);
    await grantRole(db, other, 'witness', null);
    await grantRole(db, moderator, 'moderator', null);
    const post = await newRequest(helped, 'Our car broke down and I cannot get to work. Please pray.');
    const { caseId } = (await as(author).post(`/posts/${post.id}/witness`, { note: 'Sincere.' })).json();
    const story = async () => {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.witness_stories (case_id, author_id, recipient_id, body) values ($1, $2, $3, 'A mechanic from a partner church fixed the car for free.')
         returning id`,
        [caseId, author, helped],
      );
      return rows[0]!.id;
    };

    const first = await story();
    expect((await as(member).delete(`/witness/stories/${first}`)).statusCode).toBe(403);
    expect((await as(other).delete(`/witness/stories/${first}`)).statusCode).toBe(404);
    expect((await as(author).delete(`/witness/stories/${first}`)).statusCode).toBe(200);
    expect((await as(author).delete(`/witness/stories/${first}`)).statusCode).toBe(404);

    const second = await story();
    expect((await as(moderator).delete(`/witness/stories/${second}`)).statusCode).toBe(200);
  });
});
