// Seed prayers. The switch is one shared row, so the "on" case runs in a rolled-back transaction.
import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as seeds from '../src/modules/seed-prayers/index.js';
import { crontab } from '../src/tasks.js';
import { as, createUser, db } from './helpers.js';

afterAll(async () => {
  await db.end();
});

describe('seed prayers', () => {
  it('comes with starter drafts, is admin-only, and posts nothing that is not approved', async () => {
    const admin = await createUser('Seed Admin');
    const member = await createUser('Seed Member');
    await grantRole(db, admin, 'admin', null);
    expect((await as(member).get('/admin/seed-prayers')).statusCode).toBe(403);
    const drafts = (await as(admin).get('/admin/seed-prayers?status=draft')).json().prayers;
    expect(drafts.filter((p: { theme: string }) => ['kindness', 'love', 'acceptance', 'peace', 'gratitude'].includes(p.theme)).length).toBeGreaterThanOrEqual(5);
    expect((await as(admin).get('/admin/seed-prayer-settings')).json().settings).toMatchObject({ enabled: false, publish_as: null, max_per_day: 1 });

    const res = await as(admin).post('/admin/seed-prayers', { body: 'Lord, help us forgive quickly and love without keeping score.', theme: 'forgiveness' });
    expect(res.statusCode).toBe(201);
    const id = res.json().prayer.id;
    expect((await as(admin).post(`/admin/seed-prayers/${id}/publish`)).statusCode).toBe(409);
    expect((await as(admin).patch('/admin/seed-prayer-settings', { publishAs: member })).statusCode).toBe(400);
    expect((await as(admin).post(`/admin/seed-prayers/${id}/retire`)).json().prayer.status).toBe('retired');
    expect(crontab).toContain('*/15 * * * * seed_prayers_publish');
  });

  it('when on, posts approved prayers from the staff account, at most the daily number', async () => {
    const admin = await createUser('Seed Admin');
    const team = await createUser('Prayer Tower team');
    await grantRole(db, admin, 'admin', null);
    await grantRole(db, team, 'moderator', null);
    const c = await db.connect();
    try {
      await c.query('begin');
      await c.query(`update public.seed_prayers set status = 'retired' where status = 'approved'`);
      await seeds.updateSettings(c, { enabled: true, publishAs: team, maxPerDay: 1 });
      const a = await seeds.create(c, admin, { postType: 'open_prayer', body: 'Lord, make us quick to listen and slow to anger today.', publishAfter: new Date(Date.now() - 3_600_000).toISOString() });
      const b = await seeds.create(c, admin, { postType: 'open_prayer', body: 'Father, bless the teachers who stay late for children who need them.', publishAfter: new Date(Date.now() - 60_000).toISOString() });
      expect(await seeds.publishDue(c)).toBe(0);
      await seeds.approve(c, admin, a.id);
      await seeds.approve(c, admin, b.id);

      // Changed text needs approving again.
      const edited = await seeds.update(c, b.id, { body: 'Father, bless the teachers who stay late for the children who need them most.' });
      expect(edited.status).toBe('draft');
      await seeds.approve(c, admin, b.id);

      expect(await seeds.publishDue(c)).toBe(1);
      expect(await seeds.publishDue(c)).toBe(0);
      const posted = (await seeds.list(c, { status: 'published' })).find((p) => p.id === a.id)!;
      const { rows } = await c.query('select user_id, body, post_type, is_anonymous from public.posts where id = $1', [posted.published_post_id]);
      expect(rows[0]).toEqual({ user_id: team, body: 'Lord, make us quick to listen and slow to anger today.', post_type: 'open_prayer', is_anonymous: false });
      await expect(seeds.update(c, a.id, { body: 'x' })).rejects.toThrow('published');

      // Turned off, nothing more goes out, but an admin can still post one by hand.
      await seeds.updateSettings(c, { enabled: false, maxPerDay: 5 });
      expect(await seeds.publishDue(c)).toBe(0);
      expect((await seeds.publish(c, b.id)).status).toBe('published');
    } finally {
      await c.query('rollback');
      c.release();
    }
  });
});
