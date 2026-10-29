import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { isNewMember, settings as safetySettings } from '../src/modules/safety/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(() => db.end());

const application = { name: 'Grace Chapel', denomination: 'Baptist', pastorTitle: 'Senior Pastor', city: 'Dayton', region: 'Ohio', country: 'United States', website: 'https://gracechapel.example' };

describe('church partners', () => {
  it('a pastor applies, an admin verifies, and the badge shows on named posts only', async () => {
    const pastor = await createUser('Pastor Paul');
    const admin = await createUser('Admin Ann');
    const reader = await createUser('Reader Rita');
    await grantRole(db, admin, 'admin', null);

    expect((await as(pastor).get('/me/church')).json().church).toBeNull();
    expect((await as(pastor).post('/me/church', { ...application, website: 'gracechapel' })).statusCode).toBe(400);
    const applied = await as(pastor).post('/me/church', application);
    expect(applied.statusCode).toBe(201);
    const id = applied.json().church.id;
    expect(applied.json().church).toMatchObject({ status: 'pending', name: 'Grace Chapel', pastorTitle: 'Senior Pastor' });
    // One open application at a time; it can be edited while pending.
    expect((await as(pastor).post('/me/church', application)).statusCode).toBe(409);
    expect((await as(pastor).put('/me/church', { ...application, city: 'Kettering' })).json().church.city).toBe('Kettering');

    // Only admins review.
    expect((await as(pastor).get('/admin/churches')).statusCode).toBe(403);
    const pending = (await as(admin).get('/admin/churches')).json().churches;
    expect(pending.find((c: { id: string }) => c.id === id)).toMatchObject({ applicant: { id: pastor, displayName: 'Pastor Paul' } });
    expect((await as(admin).post(`/admin/churches/${id}/decision`, { decision: 'decline' })).statusCode).toBe(400); // a note is required

    const named = await newRequest(pastor, 'Pray for our food pantry this winter.');
    const anon = await newRequest(pastor, 'Pray for me, I am weary.', { isAnonymous: true });
    expect((await as(admin).post(`/admin/churches/${id}/decision`, { decision: 'verify' })).json().church.status).toBe('verified');
    expect((await as(pastor).get('/me')).json().roles).toContain('pastor');
    const notice = (await as(pastor).get('/me/notifications')).json().notifications.find((n: { kind: string }) => n.kind === 'church_verified');
    expect(notice.title).toBe('Grace Chapel is verified');

    const cards = (await as(reader).get(`/posts/${named.id}`)).json();
    expect(cards.post.author.pastor).toEqual({ title: 'Senior Pastor', church: 'Grace Chapel' });
    const anonCard = (await as(reader).get(`/posts/${anon.id}`)).json();
    expect(anonCard.post.author.pastor).toBeNull();
    expect((await as(reader).get(`/people/${pastor}`)).json().person.pastor).toEqual({ title: 'Senior Pastor', church: 'Grace Chapel' });
    // Verified pastors skip the new-member limits and carry the badge as event hosts.
    expect(await isNewMember(db, pastor, await safetySettings(db))).toBe(false);
    expect(await isNewMember(db, reader, await safetySettings(db))).toBe(true);
    const startsAt = new Date(Date.now() + 86_400_000).toISOString();
    const hosted = await as(pastor).post('/events', { title: 'Pantry prayer night', kind: 'prayer_meeting', location: 'Grace Chapel', startsAt });
    expect(hosted.statusCode).toBe(201);
    expect((await as(reader).get(`/events/${hosted.json().event.id}`)).json().event.host.pastor).toEqual({ title: 'Senior Pastor', church: 'Grace Chapel' });

    // Revoking removes the role and the badge, and tells the pastor why.
    await as(admin).post(`/admin/churches/${id}/decision`, { decision: 'revoke', note: 'The church asked us to remove the listing.' });
    expect((await as(pastor).get('/me')).json().roles).not.toContain('pastor');
    expect((await as(reader).get(`/people/${pastor}`)).json().person.pastor).toBeNull();
    expect((await as(pastor).get('/me/church')).json().church).toMatchObject({ status: 'declined', reviewNote: 'The church asked us to remove the listing.' });
    // After a decline, the member may apply again.
    expect((await as(pastor).post('/me/church', application)).statusCode).toBe(201);
    await as(pastor).delete('/me/church');
    expect((await as(pastor).get('/me/church')).json().church.status).toBe('declined');
  });

  it('is not offered to Open Circle members', async () => {
    const admin = await createUser('Admin Abe');
    await grantRole(db, admin, 'admin', null);
    await as(admin).patch('/admin/communities/open-circle', { status: 'active' });
    const member = await createUser('Neighbor Nia');
    expect((await as(member).post('/me/community', { slug: 'open-circle' })).statusCode).toBeLessThan(300);
    const res = await as(member).post('/me/church', application);
    expect(res.statusCode).toBe(403);
    expect(res.json().message).not.toMatch(/church/i);
    await db.query(`update public.communities set status = 'hidden' where slug = 'open-circle'`);
  });
});
