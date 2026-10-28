import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as care from '../src/modules/care/index.js';
import { eraseConfessions, ERASED_TEXT } from '../src/modules/retention/index.js';
import { as, createUser, db, drainJobs } from './helpers.js';

afterAll(async () => {
  await care.updateSettings(db, { careEnabled: true, confessionEnabled: false, maxOpenPerMember: 2, confessionRetentionDays: 7 });
  await db.query(`update public.communities set status = 'hidden' where slug = 'open-circle'`);
  await db.end();
});

describe('confession with clergy', () => {
  it('goes only to pastors, says nothing of what was confessed, and is erased after it closes', async () => {
    const admin = await createUser('Confession Admin');
    await grantRole(db, admin, 'admin', null);
    const member = await createUser('Penitent Pete');
    const partner = await createUser('Partner Polly');
    const pastor = await createUser('Father Frank');
    await grantRole(db, partner, 'prayer_partner', null);
    await grantRole(db, pastor, 'pastor_counselor', null);
    await care.updateSettings(db, { careEnabled: true, confessionEnabled: false, maxOpenPerMember: 5 });
    expect((await as(member).post('/care-requests', { kind: 'confession', body: 'x' })).statusCode).toBe(403);

    const set = await as(admin).patch('/admin/care-settings', { confessionEnabled: true, confessionRetentionDays: 3 });
    expect(set.json().settings).toMatchObject({ confession_enabled: true, confession_retention_days: 3 });
    expect((await as(member).get('/care')).json()).toMatchObject({ kinds: ['pray_with_me', 'pastor', 'confession'], confessionRetentionDays: 3 });

    const secret = 'I took money from the offering plate.';
    const { id } = (await as(member).post('/care-requests', { kind: 'confession', body: secret })).json();
    await drainJobs();
    const { rows: notes } = await db.query(`select title, body from public.notifications where user_id = $1 and kind = 'care_request'`, [pastor]);
    expect(notes[0]).toEqual({ title: 'Someone asked to make a confession', body: 'Open the care queue to reach out.' });
    expect(JSON.stringify(notes)).not.toContain('offering');

    expect((await as(partner).get('/care/queue')).json().requests.map((r: { id: string }) => r.id)).not.toContain(id);
    expect((await as(partner).post(`/care-requests/${id}/claim`)).statusCode).toBe(403);
    const { conversationId } = (await as(pastor).post(`/care-requests/${id}/claim`)).json();
    await as(pastor).post(`/conversations/${conversationId}/messages`, { body: 'You are forgiven. Go in peace.' });
    expect((await as(member).post(`/care-requests/${id}/close`)).statusCode).toBe(200);

    // Not yet due: kept for 3 days after closing.
    expect(await eraseConfessions(db)).toBe(0);
    await db.query(`update public.care_requests set closed_at = now() - interval '4 days' where id = $1`, [id]);
    expect(await eraseConfessions(db)).toBe(1);
    const { rows } = await db.query('select body, conversation_id from public.care_requests where id = $1', [id]);
    expect(rows[0]).toEqual({ body: ERASED_TEXT, conversation_id: null });
    expect((await db.query('select 1 from public.messages where conversation_id = $1', [conversationId])).rowCount).toBe(0);
    expect((await as(member).get(`/conversations/${conversationId}`)).statusCode).toBe(404);

    // 0 days: erased the moment it closes.
    await care.updateSettings(db, { confessionRetentionDays: 0 });
    const second = (await as(member).post('/care-requests', { kind: 'confession', body: 'Another thing.' })).json();
    await as(pastor).post(`/care-requests/${second.id}/claim`);
    await as(pastor).post(`/care-requests/${second.id}/close`);
    expect((await db.query('select body from public.care_requests where id = $1', [second.id])).rows[0].body).toBe(ERASED_TEXT);
  });

  it('is not offered in the non-religious community', async () => {
    await care.updateSettings(db, { careEnabled: true, confessionEnabled: true });
    await db.query(`update public.communities set status = 'active' where slug = 'open-circle'`);
    const kim = await createUser('Circle Kim');
    await as(kim).post('/me/community', { slug: 'open-circle' });
    expect((await as(kim).get('/care')).json().kinds).not.toContain('confession');
    expect((await as(kim).post('/care-requests', { kind: 'confession', body: 'x' })).statusCode).toBe(403);
  });
});
