// Bible reading plan: off by default; admins and pastors set daily passages for their
// community; members see today's, mark it read; Open Circle never sees it.
import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as plan from '../src/modules/reading-plan/index.js';
import { as, createUser, db } from './helpers.js';

afterAll(async () => {
  await db.query('update public.notebook_settings set reading_plan_enabled = false');
  await db.end();
});

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

describe('Bible reading plan', () => {
  it('shows today\'s passage and counts readers', async () => {
    const pastor = await createUser('Plan Pastor');
    await grantRole(db, pastor, 'pastor', null);
    const member = await createUser('Plan Reader');
    expect((await as(member).get('/reading-plan')).json()).toEqual({ enabled: false });
    expect((await as(pastor).post('/staff/reading-plans', { title: 'John', startsOn: daysAgo(1), references: ['John 1'] })).statusCode).toBe(403);

    await db.query('update public.notebook_settings set reading_plan_enabled = true');
    expect((await as(member).post('/staff/reading-plans', { title: 'John', startsOn: daysAgo(1), references: ['John 1'] })).statusCode).toBe(403);
    await db.query('update public.reading_plans set archived_at = now() where archived_at is null');
    const created = await as(pastor).post('/staff/reading-plans', { title: 'Gospel of John', startsOn: daysAgo(1), references: ['John 1', 'John 2', 'John 3'] });
    expect(created.statusCode).toBe(201);
    const { id } = created.json();

    const today = (await as(member).get('/reading-plan')).json();
    expect(today.plan).toMatchObject({ id, title: 'Gospel of John', day: 2, days: 3, reading: { reference: 'John 2', read: false, readers: 0 } });
    expect(today.plan.reading.url).toBe('https://www.biblegateway.com/passage/?search=John%202&version=WEB');
    const read = (await as(member).post(`/reading-plan/${id}/read`)).json();
    expect(read.plan.reading).toMatchObject({ read: true, readers: 1 });
    expect((await as(pastor).get('/staff/reading-plans')).json().plans.find((p: { id: string }) => p.id === id)).toMatchObject({ id, days: 3, readers: 1, archived: false });

    expect((await as(pastor).post(`/staff/reading-plans/${id}/archive`)).json()).toEqual({ archived: true });
    expect((await as(member).get('/reading-plan')).json()).toEqual({ enabled: true, plan: null });
  });

  it('is never offered in Open Circle', async () => {
    const member = await createUser('Plan Secular');
    const c = await db.connect();
    try {
      await c.query('begin');
      await c.query(`update public.communities set status = 'active' where slug = 'open-circle'`);
      await c.query('delete from public.community_memberships where user_id = $1', [member]);
      await c.query(`insert into public.community_memberships (community_id, user_id, is_primary) select id, $1, true from public.communities where slug = 'open-circle'`, [member]);
      await c.query('update public.notebook_settings set reading_plan_enabled = true');
      expect(await plan.today(c, member)).toEqual({ enabled: false });
    } finally {
      await c.query('rollback');
      c.release();
    }
  });
});
