import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { as, createUser, db } from './helpers.js';

afterAll(() => db.end());

describe('pilot feedback', () => {
  it('lets members send feedback that only admins read and close', async () => {
    const member = await createUser('Feedback Fran');
    const admin = await createUser('Feedback Admin');
    await grantRole(db, admin, 'admin', null);

    expect((await as(member).post('/feedback', { kind: 'bug', body: '' })).statusCode).toBe(400);
    const res = await as(member).post('/feedback', { kind: 'bug', body: 'The Pray button froze on my phone.', platform: 'ios', appVersion: '1.0.0 (3)' });
    expect(res.statusCode).toBe(201);
    const { id } = res.json();

    expect((await as(member).get('/admin/feedback')).statusCode).toBe(403);
    const list = (await as(admin).get('/admin/feedback')).json().feedback as { id: string; name: string; kind: string; platform: string }[];
    expect(list.find((f) => f.id === id)).toMatchObject({ name: 'Feedback Fran', kind: 'bug', platform: 'ios' });

    expect((await as(member).post(`/admin/feedback/${id}/close`)).statusCode).toBe(403);
    expect((await as(admin).post(`/admin/feedback/${id}/close`)).statusCode).toBe(200);
    expect((await as(admin).post(`/admin/feedback/${id}/close`)).statusCode).toBe(404);
    expect(((await as(admin).get('/admin/feedback')).json().feedback as { id: string }[]).some((f) => f.id === id)).toBe(false);
  });

  it('suggests tags, lets admins triage, filter and export it as CSV', async () => {
    const member = await createUser('Triage Tess');
    const admin = await createUser('Triage Admin');
    await grantRole(db, admin, 'admin', null);

    const crash = (await as(member).post('/feedback', { kind: 'bug', body: 'The app crashed when I opened notifications.' })).json().id;
    const praise = (await as(member).post('/feedback', { kind: 'other', body: '=HYPERLINK("x") Me encanta, gracias!' })).json().id;
    const all = (await as(admin).get('/admin/feedback?status=all&limit=5000')).json().feedback as { id: string; tags: string[]; status: string }[];
    expect(all.find((f) => f.id === crash)!.tags).toEqual(expect.arrayContaining(['bug', 'crash', 'notifications']));
    expect(all.find((f) => f.id === praise)!.tags).toEqual(['praise']);

    expect((await as(member).patch(`/admin/feedback/${crash}`, { severity: 'high' })).statusCode).toBe(403);
    expect((await as(admin).patch(`/admin/feedback/${crash}`, {})).statusCode).toBe(400);
    expect((await as(admin).patch(`/admin/feedback/${crash}`, { tags: ['nonsense'] })).statusCode).toBe(400);
    expect((await as(admin).patch(`/admin/feedback/${crash}`, { tags: ['crash', 'notifications'], severity: 'blocker', note: 'Repro on iOS 26' })).statusCode).toBe(200);
    // Changing only the note keeps the tags and severity.
    expect((await as(admin).patch(`/admin/feedback/${crash}`, { note: 'Repro on iOS 26, fixed in next build' })).statusCode).toBe(200);

    const crashes = (await as(admin).get('/admin/feedback?tag=crash')).json().feedback as { id: string; tags: string[]; severity: string; note: string }[];
    // Earlier runs on the same database leave older items; find this run's.
    expect(crashes.find((f) => f.id === crash)).toMatchObject({ id: crash, tags: ['crash', 'notifications'], severity: 'blocker', note: 'Repro on iOS 26, fixed in next build' });
    expect(crashes.every((f) => f.tags.includes('crash'))).toBe(true);

    await as(admin).post(`/admin/feedback/${praise}/close`);
    expect((await as(member).get('/admin/feedback/export')).statusCode).toBe(403);
    const csv = await as(admin).get('/admin/feedback/export?tag=praise');
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.headers['content-disposition']).toMatch(/prayer-tower-feedback\.csv/);
    const lines = csv.body.trim().split('\n');
    expect(lines[0]).toBe('createdAt,status,tags,severity,kind,body,note,name,platform,appVersion,triagedAt,closedAt,id');
    const row = lines.find((l) => l.endsWith(praise))!;
    expect(row).toContain(',closed,praise,');
    // A cell that starts with = is quoted so a spreadsheet won't run it.
    expect(row).toContain(`"'=HYPERLINK(""x"") Me encanta, gracias!"`);
    expect(lines.some((l) => l.endsWith(crash))).toBe(false);
  });

  it('is deleted with the account', async () => {
    const leaver = await createUser('Feedback Leaver');
    await as(leaver).post('/feedback', { body: 'Loved it, but moving on.' });
    await as(leaver).inject('DELETE', '/me', { confirm: 'DELETE' });
    expect((await db.query('select 1 from public.feedback where user_id = $1', [leaver])).rowCount).toBe(0);
  });
});
