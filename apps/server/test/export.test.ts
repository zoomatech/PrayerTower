import { afterAll, describe, expect, it } from 'vitest';
import { as, createUser, db, drainJobs, newRequest } from './helpers.js';

afterAll(async () => {
  await db.end();
});

describe('download my data', () => {
  it("returns the member's own records and nothing that names who reported or blocked them", async () => {
    const poster = await createUser('Ruth');
    const member = await createUser('Naomi');
    const post = await newRequest(poster);
    await as(member).post(`/posts/${post.id}/praying-now`, {});
    await as(member).post(`/posts/${post.id}/commitments`, { frequency: 'weekly', vowText: 'I will pray each Sunday.' });
    await as(member).post('/reports', { targetType: 'post', targetId: post.id, reason: 'testing the export' });
    await as(member).put(`/people/${poster}/block`, {});
    await drainJobs();

    const res = await as(poster).get('/me/export');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="prayer-tower-data-\d{4}-\d{2}-\d{2}\.json"$/);
    const data = res.json();
    expect(data.format).toBe('prayer-tower-export/1');
    expect(data.profile.id).toBe(poster);
    expect(data.account.email).toContain('@');
    expect(data.posts.map((p: { id: string }) => p.id)).toContain(post.id);
    expect(data.prayers).toHaveLength(0);
    expect(data.notifications.length).toBeGreaterThan(0);
    // Reports and blocks against Ruth stay private to the people who made them.
    const text = JSON.stringify(data);
    expect(text).not.toContain(member);
    expect(text).not.toContain('testing the export');

    const mine = (await as(member).get('/me/export')).json();
    expect(mine.prayers.length).toBeGreaterThan(0);
    expect(mine.commitments[0].vow_text ?? mine.commitments[0].vowText).toBe('I will pray each Sunday.');
    expect(mine.blocked.map((b: { blocked_id: string }) => b.blocked_id)).toEqual([poster]);
    expect(mine.posts).toHaveLength(0);
  });

  it('needs a sign-in', async () => {
    const { app } = await import('./helpers.js');
    expect((await app.inject({ method: 'GET', url: '/me/export' })).statusCode).toBe(401);
  });
});
