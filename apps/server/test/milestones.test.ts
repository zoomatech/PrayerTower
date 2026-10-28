import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as tokens from '../src/modules/tokens/index.js';
import { as, createUser, db, drainJobs, newRequest } from './helpers.js';

const created: string[] = [];
afterAll(async () => {
  await db.query('update public.milestone_rules set enabled = false where id = any($1)', [created]);
  await db.end();
});

const runDue = async () => {
  await db.query(`select graphile_worker.add_job('milestones_award_due', '{}')`);
  await drainJobs();
};

describe('milestone bonus tokens', () => {
  it('ships placeholder rules that are all off', async () => {
    const admin = await createUser('Milestone Admin');
    await grantRole(db, admin, 'admin', null);
    const { rules } = (await as(admin).get('/admin/milestones')).json();
    const placeholders = rules.filter((r: { label: string }) => r.label.endsWith('(placeholder)'));
    expect(placeholders).toHaveLength(3);
    expect(placeholders.every((r: { enabled: boolean }) => !r.enabled)).toBe(true);
  });

  it('awards an enabled rule once per member, and only admins can set rules', async () => {
    const admin = await createUser('Milestone Admin 2');
    await grantRole(db, admin, 'admin', null);
    expect((await as(await createUser('Not Admin')).post('/admin/milestones', {})).statusCode).toBe(403);
    const res = await as(admin).post('/admin/milestones', { label: 'Answered prayer', metric: 'answered_requests', threshold: 1, amount: 4 });
    expect(res.statusCode).toBe(201);
    const rule = res.json().rule;
    created.push(rule.id);
    expect(rule.enabled).toBe(false);

    const member = await createUser('Hannah Answered');
    const post = await newRequest(member, 'Pray for a child.');
    await as(member).post(`/posts/${post.id}/answered`);
    await runDue(); // rule still off
    expect(await tokens.balanceOf(db, member)).toBe(0);

    expect((await as(admin).patch(`/admin/milestones/${rule.id}`, { enabled: true })).json().rule.enabled).toBe(true);
    await runDue();
    await runDue();
    expect(await tokens.balanceOf(db, member)).toBe(4);
    const note = (await as(member).get('/me/notifications')).json().notifications.find((n: { kind: string }) => n.kind === 'milestone');
    expect(note).toMatchObject({ title: 'Milestone: Answered prayer' });
  });
});
