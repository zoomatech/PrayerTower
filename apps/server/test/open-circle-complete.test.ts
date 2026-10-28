import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { renderDigest } from '../src/modules/digest/index.js';
import { renderInviteEmail } from '../src/modules/invites/email.js';
import { notify } from '../src/modules/notifications/index.js';
import { as, createUser, db } from './helpers.js';

const RELIGIOUS = /\b(pray\w*|god|lord|jesus|church|pastors?|priestly|scripture|blessed)\b/i;

afterAll(async () => {
  await db.query(`update public.communities set status = 'hidden', hidden_features = '{}' where slug = 'open-circle'`);
  await db.end();
});

async function openCircleMember(name: string) {
  const admin = await createUser(`${name} Admin`);
  await grantRole(db, admin, 'admin', null);
  await as(admin).patch('/admin/communities/open-circle', { status: 'active' });
  const member = await createUser(name);
  await as(member).post('/me/community', { slug: 'open-circle' });
  return { admin, member };
}

describe('Open Circle complete', () => {
  it('takes religious words out of notices and errors for Open Circle members only', async () => {
    const { member } = await openCircleMember('OC Notice');
    const other = await createUser('Faith Notice');
    for (const id of [member, other]) {
      await notify(db, id, { kind: 'moderation', title: 'Your prayer was removed', body: 'Your prayer matters. Pray again any time.' });
    }
    const mine = (await as(member).get('/me/notifications')).json().notifications[0];
    expect(`${mine.title} ${mine.body}`).not.toMatch(RELIGIOUS);
    expect((await as(other).get('/me/notifications')).json().notifications[0].title).toBe('Your prayer was removed');

    // A server error with religious words, read by each member.
    const post = (await as(other).post('/posts', { postType: 'prayer_request', body: 'Please keep my family in mind.' })).json().post.id;
    const body = { storagePath: 'x/y.m4a', durationSeconds: 5 };
    const secular = await as(member).post(`/posts/${post}/spoken-prayers`, body);
    const faith = await as(other).post(`/posts/${post}/spoken-prayers`, body);
    expect(faith.json().message).toBe('Spoken prayers are not turned on');
    expect(secular.json().message).toBe('Spoken messages are not turned on');
  });

  it('lets admins hide features for one community, and the server refuses them', async () => {
    const { admin, member } = await openCircleMember('OC Hidden');
    const faith = await createUser('Faith Hidden');
    expect((await as(admin).patch('/admin/communities/open-circle', { hiddenFeatures: ['nope'] })).statusCode).toBe(400);
    const set = await as(admin).patch('/admin/communities/open-circle', { hiddenFeatures: ['care', 'events', 'pools'] });
    expect(set.json().community.hiddenFeatures).toEqual(['care', 'events', 'pools']);
    expect((await as(member).get('/me')).json().community.hiddenFeatures).toEqual(['care', 'events', 'pools']);

    expect((await as(member).get('/care')).json().enabled).toBe(false);
    expect((await as(member).post('/care-requests', { kind: 'pray_with_me', body: 'Could use someone to talk to.' })).statusCode).toBe(403);
    const event = { kind: 'meetup', title: 'Walk', startsAt: new Date(Date.now() + 86_400_000).toISOString(), durationMinutes: 60, location: 'The park' };
    expect((await as(member).post('/events', event)).statusCode).toBe(403);
    // The default community still has them.
    expect((await as(faith).post('/events', event)).statusCode).not.toBe(403);
    await as(admin).patch('/admin/communities/open-circle', { hiddenFeatures: [] });
  });

  it("keeps Prayer Cast, featured needs and highlights inside the member's community", async () => {
    const { member } = await openCircleMember('OC Lists');
    const faith = await createUser('Faith Lists');
    const post = (await as(faith).post('/posts', { postType: 'prayer_request', body: 'Faith-feed request for the lists test.' })).json().post.id;
    await db.query(`insert into public.prayer_events (post_id, user_id) select $1, id from public.profiles where id <> $2 limit 3`, [post, faith]).catch(() => undefined);
    const hl = (await as(member).get('/highlights')).json();
    expect(JSON.stringify(hl)).not.toContain('Faith-feed request for the lists test.');
    const cast = (await as(member).get('/prayer-cast')).json();
    expect(cast.cast.every((c: { text: string }) => !c.text.includes('Faith-feed'))).toBe(true);
  });

  it('sends Open Circle wording in the weekly email and in invites to Open Circle', async () => {
    const d = { name: 'Sam', prayers: 2, people: 1, active: 1, kept: 1, answered: [] };
    const mail = renderDigest(d as never, 'en', 'sam@example.com', true);
    expect(`${mail.subject} ${mail.text}`).not.toMatch(RELIGIOUS);
    const invite = renderInviteEmail({
      to: 'a@example.com', code: 'ABCDEFGH', lang: 'en', from: 'Sam', links: { webAppUrl: null, appStoreUrl: null, playStoreUrl: null },
      community: { name: 'Open Circle', secular: true },
    });
    expect(invite.subject).toBe('You are invited to Open Circle');
    expect(invite.text).not.toMatch(RELIGIOUS);
  });

  it('puts people invited to Open Circle straight into it', async () => {
    const { admin } = await openCircleMember('OC Invite');
    const made = await as(admin).post('/admin/invites', { community: 'open-circle', note: 'Neighbors' });
    expect(made.statusCode, made.body).toBeLessThan(300);
    const code = made.json().invites[0].code;
    expect(made.json().invites[0].community).toMatchObject({ slug: 'open-circle', secular: true });
    const id = crypto.randomUUID();
    await db.query(
      `insert into auth.users (id, email, raw_user_meta_data, aud, role) values ($1, $2, $3, 'authenticated', 'authenticated')`,
      [id, `${id}@test.local`, { display_name: 'Invited', invite_code: code }],
    );
    expect((await as(id).get('/me')).json().community.slug).toBe('open-circle');
  });
});
