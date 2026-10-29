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
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="my-data-\d{4}-\d{2}-\d{2}\.json"$/);
    const data = res.json();
    expect(data.format).toBe('member-data/1');
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

describe('download my data covers every table', () => {
  it('exports or deliberately leaves out every table that points at a member', async () => {
    const { EXPORTED_TABLES, NOT_EXPORTED } = await import('../src/modules/accounts/export.js');
    const { rows } = await db.query<{ tbl: string }>(
      `select distinct c.conrelid::regclass::text as tbl from pg_constraint c
        where c.contype = 'f' and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
          and c.connamespace = 'public'::regnamespace`,
    );
    const known = new Set([...EXPORTED_TABLES, ...NOT_EXPORTED, 'profiles']);
    expect(rows.map((r) => r.tbl.replace(/^public\./, '')).filter((t) => !known.has(t))).toEqual([]);
  });

  it("includes the newer features: lock-screen follows without the push token, and the prayer chain", async () => {
    const member = await createUser('Exporting Eve');
    const post = await newRequest(member, 'Pray for my new job.');
    await db.query(`insert into public.live_activities (user_id, post_id, push_token, app_id) values ($1, $2, encode(gen_random_bytes(16), 'hex'), 'com.zoomatech.prayertower')`, [member, post.id]);
    await db.query(`insert into public.prayer_chain_members (owner_id, email, token) values ($1, 'mom@example.com', 'tok-eve-' || encode(gen_random_bytes(16), 'hex'))`, [member]);
    const data = (await as(member).get('/me/export')).json();
    expect(data.lockScreenFollows).toHaveLength(1);
    expect(data.lockScreenFollows[0].push_token).toBeUndefined();
    expect(data.prayerChain[0].email).toBe('mom@example.com');
    expect(JSON.stringify(data)).not.toContain('tok-eve-');
  });
});
