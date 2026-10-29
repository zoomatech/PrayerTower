// Optional outside support link: only listed sites, shown on the profile only while
// switched on and only within the member's community.
import { afterAll, describe, expect, it } from 'vitest';
import { as, createUser, db } from './helpers.js';

afterAll(async () => {
  await db.query('update public.notebook_settings set support_links_enabled = false');
  await db.end();
});

describe('Outside support link', () => {
  it('accepts only listed sites and shows the link while switched on', async () => {
    const member = await createUser('Link Member');
    const viewer = await createUser('Link Viewer');
    for (const bad of ['http://ko-fi.com/me', 'https://shop.example/me', 'https://ko-fi.com/', 'https://user:pw@ko-fi.com/me']) {
      expect((await as(member).patch('/me', { supportUrl: bad })).statusCode, bad).toBe(400);
    }
    expect((await as(member).patch('/me', { supportUrl: 'https://ko-fi.com/linkmember' })).statusCode).toBe(200);
    expect((await as(viewer).get(`/people/${member}`)).json().person.supportUrl).toBeNull();
    await db.query('update public.notebook_settings set support_links_enabled = true');
    expect((await as(viewer).get(`/people/${member}`)).json().person.supportUrl).toBe('https://ko-fi.com/linkmember');

    // Not across communities.
    const circle = await createUser('Link Circle');
    await db.query('delete from public.community_memberships where user_id = $1', [circle]);
    await db.query(`insert into public.community_memberships (community_id, user_id, is_primary) select id, $1, true from public.communities where slug = 'open-circle'`, [circle]);
    const res = await as(circle).get(`/people/${member}`);
    if (res.statusCode === 200) expect(res.json().person.supportUrl).toBeNull();

    expect((await as(member).patch('/me', { supportUrl: null })).statusCode).toBe(200);
    expect((await as(viewer).get(`/people/${member}`)).json().person.supportUrl).toBeNull();
  });
});
