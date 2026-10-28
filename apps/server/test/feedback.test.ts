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

  it('is deleted with the account', async () => {
    const leaver = await createUser('Feedback Leaver');
    await as(leaver).post('/feedback', { body: 'Loved it, but moving on.' });
    await as(leaver).inject('DELETE', '/me', { confirm: 'DELETE' });
    expect((await db.query('select 1 from public.feedback where user_id = $1', [leaver])).rowCount).toBe(0);
  });
});
