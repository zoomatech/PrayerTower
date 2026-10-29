// Pilot tools (docs/PILOT_TOOLS.md): "Tell Steve", the weekly feedback summary
// and the error log, each off until an admin turns it on.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { grantRole } from '../src/modules/accounts/index.js';
import type { Mail } from '../src/modules/digest/mailer.js';
import * as pilot from '../src/modules/pilot-tools/index.js';
import { as, createUser, db } from './helpers.js';

const defaults = await pilot.settings(db);
let admin: string;
let member: string;

beforeAll(async () => {
  admin = await createUser('Pilot Admin');
  member = await createUser('Pilot Tester');
  await grantRole(db, admin, 'admin', null);
});
afterAll(async () => {
  await pilot.updateSettings(db, {
    tellFounder: defaults.tell_founder_enabled,
    founderName: defaults.founder_name,
    feedbackSummary: defaults.feedback_summary_enabled,
    feedbackSummaryEmail: defaults.feedback_summary_email,
    errorCapture: defaults.error_capture_enabled,
  });
  await db.end();
});

describe('pilot tools', () => {
  it('are all off by default, and only admins change them', async () => {
    expect(defaults).toMatchObject({ tell_founder_enabled: false, founder_name: 'Steve', feedback_summary_enabled: false, error_capture_enabled: false });
    expect((await as(member).get('/pilot/tell')).json()).toEqual({ enabled: false, name: 'Steve' });
    expect((await as(member).patch('/admin/pilot-tools', { tellFounder: true })).statusCode).toBe(403);
    expect((await as(member).get('/admin/errors')).statusCode).toBe(403);
    const on = await as(admin).patch('/admin/pilot-tools', { tellFounder: true, founderName: 'Steve' });
    expect(on.json().settings.tell_founder_enabled).toBe(true);
    expect((await as(member).get('/pilot/tell')).json()).toEqual({ enabled: true, name: 'Steve' });
  });

  it('keeps no app errors while the log is off, and groups them once it is on', async () => {
    await pilot.updateSettings(db, { errorCapture: false });
    const report = { message: 'Cannot read properties of undefined (post 3f2a1c9e-1111-4222-8333-944455556666)', screen: 'post/[id]', platform: 'ios', appVersion: '1.0.0' };
    expect((await as(member).post('/pilot/errors', report)).statusCode).toBe(202);
    expect((await as(admin).get('/admin/errors?status=all')).json().errors.find((e: { place: string }) => e.place === 'post/[id]')).toBeUndefined();

    await pilot.updateSettings(db, { errorCapture: true });
    await as(member).post('/pilot/errors', report);
    await as(member).post('/pilot/errors', { ...report, message: report.message.replace('3f2a1c9e', '7d7d7d7d') });
    const rows = (await as(admin).get('/admin/errors')).json().errors.filter((e: { place: string }) => e.place === 'post/[id]');
    // The id is scrubbed, so both are one error, seen twice.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'app', count: 2, platform: 'ios', message: 'Cannot read properties of undefined (post :id)', lastUser: { id: member } });

    expect((await as(admin).post(`/admin/errors/${rows[0].id}/resolve`)).statusCode).toBe(200);
    expect((await as(admin).get('/admin/errors')).json().errors.find((e: { id: string }) => e.id === rows[0].id)).toBeUndefined();
    // It comes back if it happens again.
    await as(member).post('/pilot/errors', report);
    expect((await as(admin).get('/admin/errors')).json().errors.find((e: { id: string }) => e.id === rows[0].id)).toMatchObject({ count: 3, resolvedAt: null });
  });

  it('logs the API’s unexpected failures by route, while the log is on', async () => {
    await pilot.updateSettings(db, { errorCapture: true });
    const broken = buildApp({ db, verifyToken: async (t) => t, logger: false });
    broken.get('/pilot-broken/:id', async () => {
      throw new Error('kaboom for someone@example.com');
    });
    const res = await broken.inject({ method: 'GET', url: '/pilot-broken/42' });
    expect(res.statusCode).toBe(500);
    // The member only reads a plain sentence.
    expect(res.json()).toEqual({ error: 'internal', message: 'Something went wrong' });
    await expect
      .poll(async () => (await pilot.list(db, { source: 'server' })).find((e) => e.place === 'GET /pilot-broken/:id')?.message)
      .toBe('kaboom for :email');
    await broken.close();
  });

  it('sends admins a weekly summary once, as a notice and an email', async () => {
    await db.query(`insert into public.feedback (user_id, kind, body, created_at) values ($1, 'bug', 'The share button does nothing', now() - interval '7 days')`, [member]);
    const now = new Date();
    const sum = await pilot.summary(db, now);
    await db.query('delete from public.feedback_summaries where week_start = $1', [sum.weekStart]);
    expect(await pilot.runWeekly(db, null, now)).toEqual({ week: null, notified: 0, emailed: 0 });

    await pilot.updateSettings(db, { feedbackSummary: true, feedbackSummaryEmail: true });
    const sent: Mail[] = [];
    const r = await pilot.runWeekly(db, async (m) => void sent.push(m), now);
    expect(r.week).toBe(sum.weekStart);
    expect(r.notified).toBeGreaterThan(0);
    expect(sent.length).toBe(r.emailed);
    const { rows } = await db.query(`select title, body, data from public.notifications where user_id = $1 and kind = 'feedback_summary'`, [admin]);
    expect(rows[0]).toMatchObject({ title: `Pilot feedback, week of ${sum.weekStart}`, data: { screen: 'feedback-triage' } });
    expect(rows[0].body).toMatch(/new \(\d+ bugs/);
    // Only once a week.
    expect((await pilot.runWeekly(db, async (m) => void sent.push(m), now)).notified).toBe(0);

    // A run whose emails all failed is finished by the retry, and only then.
    await db.query('delete from public.feedback_summaries where week_start = $1', [sum.weekStart]);
    await expect(pilot.runWeekly(db, async () => Promise.reject(new Error('SMTP down')), now)).rejects.toThrow('SMTP down');
    const retried: Mail[] = [];
    expect((await pilot.runWeekly(db, async (m) => void retried.push(m), now)).emailed).toBe(r.emailed);
    expect(retried.length).toBe(r.emailed);
    expect((await pilot.runWeekly(db, async (m) => void retried.push(m), now)).emailed).toBe(0);
    await pilot.updateSettings(db, { feedbackSummary: false });
  });
});
