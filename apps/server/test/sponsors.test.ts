// Sponsor recognition (Business Plan 11.4). The page switch is one shared row, so the
// public-page checks run in a rolled-back transaction.
import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as sponsors from '../src/modules/sponsors/index.js';
import { app, as, createUser, db } from './helpers.js';

afterAll(async () => {
  await db.end();
});

describe('sponsors', () => {
  it('lets only admins record and hide sponsors, and refuses links and missing pools', async () => {
    const admin = await createUser('Sponsor Admin');
    const member = await createUser('Sponsor Member');
    await grantRole(db, admin, 'admin', null);
    const s = { name: 'The Okafor family', kind: 'launch', thanks: 'For the first year of servers.' };
    expect((await as(member).post('/admin/sponsors', s)).statusCode).toBe(403);
    expect((await as(admin).post('/admin/sponsors', { ...s, thanks: 'Visit okafor-plumbing.com today' })).statusCode).toBe(400);
    expect((await as(admin).post('/admin/sponsors', { ...s, name: 'https://example.org' })).statusCode).toBe(400);
    expect((await as(admin).post('/admin/sponsors', { ...s, kind: 'pool' })).statusCode).toBe(400);
    const res = await as(admin).post('/admin/sponsors', s);
    expect(res.statusCode).toBe(201);
    const id = res.json().sponsor.id;
    expect((await as(admin).patch(`/admin/sponsors/${id}`, { hidden: true })).json().sponsor.hidden_at).toBeTruthy();
    expect((await as(admin).patch(`/admin/sponsors/${id}`, { hidden: false })).json().sponsor.hidden_at).toBeNull();
    const list = (await as(admin).get('/admin/sponsors')).json();
    expect(list.settings).toEqual({ pageEnabled: expect.any(Boolean) });
    expect(list.sponsors.some((x: { id: string }) => x.id === id)).toBe(true);
    expect((await as(member).patch('/admin/sponsors/settings', { pageEnabled: true })).statusCode).toBe(403);
  });

  it('publishes only shown sponsors, grouped, with no links, and only while switched on', async () => {
    const admin = await createUser('Sponsor Admin');
    const c = await db.connect();
    try {
      await c.query('begin');
      await c.query('delete from public.sponsors');
      await sponsors.updateSettings(c, { pageEnabled: false });
      expect(await sponsors.publicList(c)).toEqual({ enabled: false });
      await sponsors.updateSettings(c, { pageEnabled: true });
      const { rows: comm } = await c.query<{ slug: string; name: string }>('select slug, name from public.communities order by created_at limit 1');
      await sponsors.create(c, admin, { name: 'Grace Fellowship', kind: 'fund', thanks: 'A gift for groceries and rent.' });
      await sponsors.create(c, admin, { name: 'A friend of the app', kind: 'community', communitySlug: comm[0]!.slug });
      const gone = await sponsors.create(c, admin, { name: 'Hidden Sponsor', kind: 'launch' });
      await sponsors.setHidden(c, gone.id, true);

      const r = await sponsors.publicList(c);
      if (!r.enabled) throw new Error('expected the page');
      expect(r.sponsors.map((x) => x.name)).toEqual(['Grace Fellowship', 'A friend of the app']);
      expect(r.sponsors[1]!.for).toBe(comm[0]!.name);
      const html = sponsors.pageHtml(r.sponsors, (x) => x);
      expect(html).toContain('<h2>Common Prayer Fund</h2>');
      expect(html).toContain('A gift for groceries and rent.');
      expect(html).not.toContain('Hidden Sponsor');
      expect(html).not.toContain('Sponsor Admin');
      expect(html).not.toMatch(/<a |<img /);
    } finally {
      await c.query('rollback');
      c.release();
    }
  });

  it('is not found on the website while switched off', async () => {
    await db.query('update public.sponsor_settings set sponsors_page_enabled = false');
    expect((await app.inject({ method: 'GET', url: '/sponsors' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/sponsors/list' })).statusCode).toBe(404);
  });
});
