import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { as, createUser, db } from './helpers.js';

afterAll(() => db.end());

describe('announcements', () => {
  it('lets admins post a banner or notice that every member sees until they dismiss it', async () => {
    const admin = await createUser('Announce Admin');
    await grantRole(db, admin, 'admin', null);
    const a = await createUser('Announce A');
    const b = await createUser('Announce B');

    expect((await as(a).post('/admin/announcements', { title: 'Hi' })).statusCode).toBe(403);
    expect((await as(a).get('/admin/announcements')).statusCode).toBe(403);
    expect((await as(admin).post('/admin/announcements', { title: '  ' })).statusCode).toBe(400);
    expect((await as(admin).post('/admin/announcements', { title: 'x', bodyEs: 'solo texto' })).statusCode).toBe(400);

    const made = await as(admin).post('/admin/announcements', {
      kind: 'notice',
      title: 'Prayer night Friday',
      body: 'Join us at 7pm.',
      titleEs: 'Noche de oración el viernes',
      bodyEs: 'Acompáñanos a las 7 p. m.',
      durationHours: 48,
    });
    expect(made.statusCode, made.body).toBe(201);
    const notice = made.json().announcement;
    expect(notice).toMatchObject({ kind: 'notice', title: 'Prayer night Friday', titleEs: 'Noche de oración el viernes' });
    expect(new Date(notice.endsAt).getTime() - Date.now()).toBeGreaterThan(47 * 3_600_000);

    const banner = (await as(admin).post('/admin/announcements', { title: 'App update out', titleEs: '' })).json().announcement;
    expect(banner).toMatchObject({ kind: 'banner', titleEs: null, endsAt: null });

    const seen = (await as(a).get('/announcements')).json().announcements.map((x: { id: string }) => x.id);
    expect(seen).toEqual(expect.arrayContaining([notice.id, banner.id]));

    expect((await as(a).post(`/announcements/${notice.id}/dismiss`)).json()).toEqual({ dismissed: true });
    expect((await as(a).post(`/announcements/${notice.id}/dismiss`)).statusCode).toBe(200);
    expect((await as(a).post('/announcements/00000000-0000-0000-0000-000000000000/dismiss')).statusCode).toBe(404);
    const afterA = (await as(a).get('/announcements')).json().announcements.map((x: { id: string }) => x.id);
    expect(afterA).not.toContain(notice.id);
    expect(afterA).toContain(banner.id);
    // Dismissing is per member.
    expect((await as(b).get('/announcements')).json().announcements.map((x: { id: string }) => x.id)).toContain(notice.id);

    const listed = (await as(admin).get('/admin/announcements')).json().announcements;
    expect(listed.find((x: { id: string }) => x.id === notice.id)).toMatchObject({ active: true, dismissals: 1 });

    const ended = await as(admin).post(`/admin/announcements/${banner.id}/end`);
    expect(ended.statusCode, ended.body).toBe(200);
    expect((await as(b).get('/announcements')).json().announcements.map((x: { id: string }) => x.id)).not.toContain(banner.id);
    expect((await as(admin).get('/admin/announcements')).json().announcements.find((x: { id: string }) => x.id === banner.id).active).toBe(false);
    expect((await as(admin).post('/admin/announcements/00000000-0000-0000-0000-000000000000/end')).statusCode).toBe(404);
  });
});
