// The public waitlist (off by default). Only this file reads waitlist_enabled,
// so the "on" case flips the shared switch and puts it back.
import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { waitlistPage } from '../src/modules/waitlist/page.js';
import { brand } from '../src/modules/site/open-circle.js';
import { app, as, createUser, db } from './helpers.js';

afterAll(async () => {
  await db.query('update public.notebook_settings set waitlist_enabled = false');
  await db.end();
});

const RELIGIOUS = /pray|prayer tower|\bgod\b|church|faith|scripture|bible|jesus|christ|pastor|spiritual|bless|ministry|worship/i;
const email = `wait-${Date.now()}@example.com`;

describe('Waitlist', () => {
  it('is hidden while off, then takes emails once, and admins invite people with a one-use code', async () => {
    expect((await app.inject({ method: 'GET', url: '/waitlist' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/waitlist/join', payload: { email } })).statusCode).toBe(404);

    await db.query('update public.notebook_settings set waitlist_enabled = true');
    expect((await app.inject({ method: 'GET', url: '/waitlist' })).body).toContain('Join the waitlist');
    expect((await app.inject({ method: 'GET', url: '/open-circle/waitlist' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/waitlist/join', payload: { email: 'not-an-email' } })).statusCode).toBe(400);
    const join = () => app.inject({ method: 'POST', url: '/waitlist/join', payload: { email, name: 'Wren' } });
    expect((await join()).statusCode).toBe(201);
    expect((await join()).statusCode).toBe(201); // again: no error, no second row

    const [admin, member] = [await createUser('Waitlist Admin'), await createUser('Waitlist Member')];
    await grantRole(db, admin, 'admin', null);
    expect((await as(member).get('/admin/waitlist')).statusCode).toBe(403);
    const mine = (await as(admin).get('/admin/waitlist')).json().entries.filter((e: { email: string }) => e.email === email);
    expect(mine).toHaveLength(1);
    const invited = (await as(admin).post(`/admin/waitlist/${mine[0].id}/invite`)).json();
    expect(invited.invite).toMatchObject({ maxUses: 1, status: 'active', community: null });
    expect((await as(admin).post(`/admin/waitlist/${mine[0].id}/invite`)).statusCode).toBe(409);
    expect((await as(admin).delete(`/admin/waitlist/${mine[0].id}`)).statusCode).toBe(200);
  });

  it('reads in Open Circle’s words with no religious wording', () => {
    const oc = waitlistPage('Open Circle', brand({ name: 'Open Circle', hosts: [], appStoreUrl: null, supportEmail: null }, '/open-circle'));
    expect(oc.slice(oc.indexOf('<body'))).not.toMatch(RELIGIOUS);
  });
});
