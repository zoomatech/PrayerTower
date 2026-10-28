import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { as, createUser, db, drainJobs, newRequest } from './helpers.js';

afterAll(async () => {
  await db.query(`update public.communities set status = 'hidden' where slug = 'open-circle'`);
  await db.end();
});

const feedIds = async (userId: string) => ((await as(userId).get('/feed')).json().posts as { id: string }[]).map((p) => p.id);

describe('Open Circle, the non-religious community', () => {
  it('is hidden until an admin turns it on', async () => {
    const admin = await createUser('Circle Admin');
    await grantRole(db, admin, 'admin', null);
    const member = await createUser('Circle Member');
    const first = (await as(member).get('/communities')).json();
    expect(first.mine).toMatchObject({ slug: 'christian-ecumenical', tradition: 'christian' });
    expect(first.choices.map((c: { slug: string }) => c.slug)).not.toContain('open-circle');
    expect((await as(member).post('/me/community', { slug: 'open-circle' })).statusCode).toBe(404);

    expect((await as(member).patch('/admin/communities/open-circle', { status: 'active' })).statusCode).toBe(403);
    expect((await as(admin).patch('/admin/communities/christian-ecumenical', { status: 'hidden' })).statusCode).toBe(400);
    const on = (await as(admin).patch('/admin/communities/open-circle', { status: 'active' })).json().community;
    expect(on).toMatchObject({ slug: 'open-circle', tradition: 'secular', status: 'active' });
    expect(on.enabledPostTypes).not.toContain('confessional');
    expect((await as(member).get('/communities')).json().choices.map((c: { slug: string }) => c.slug)).toContain('open-circle');
  });

  it('keeps each community in its own feed, and its own post types', async () => {
    const christian = await createUser('Faith Fran');
    const circle = await createUser('Kind Kim');
    await db.query(`update public.communities set status = 'active' where slug = 'open-circle'`);
    const moved = (await as(circle).post('/me/community', { slug: 'open-circle' })).json().community;
    expect(moved).toMatchObject({ slug: 'open-circle', tradition: 'secular' });
    expect((await as(circle).get('/me')).json().community.slug).toBe('open-circle');

    const prayer = await newRequest(christian, 'Please pray for my mother.');
    const support = await newRequest(circle, 'Big job interview tomorrow, wish me luck!');
    const { rows } = await db.query('select community_id = public.default_community_id() as dflt from public.posts where id = $1', [support.id]);
    expect(rows[0].dflt).toBe(false);
    expect(await feedIds(circle)).toContain(support.id);
    expect(await feedIds(circle)).not.toContain(prayer.id);
    expect(await feedIds(christian)).not.toContain(support.id);

    const confession = await as(circle).post('/posts', { postType: 'confessional', body: 'Something I regret.' });
    expect(confession.statusCode).toBe(400);
  });

  it('sums up the week without religious words for Open Circle members', async () => {
    const circle = await createUser('Weekly Wren');
    const friend = await createUser('Weekly Will');
    await db.query(`update public.communities set status = 'active' where slug = 'open-circle'`);
    await as(circle).post('/me/community', { slug: 'open-circle' });
    expect((await as(circle).get('/me/commitments/review')).json().message).toBe('When you are ready, there are people who could use some support.');
    const post = await newRequest(friend, 'A long week ahead.');
    await as(circle).post(`/posts/${post.id}/praying-now`, {});
    const review = (await as(circle).get('/me/commitments/review')).json();
    expect(review.message).toBe('This week you supported people 1 time on 1 request. Thank you for being there for them.');
    expect(review.message).not.toMatch(/pray/i);
    expect((await as(friend).get('/me/commitments/review')).json().message).toContain('people waiting for prayer');
  });

  it('uses plain, warm wording in notices to Open Circle members', async () => {
    const circle = await createUser('Notice Nia');
    const friend = await createUser('Friendly Fay');
    await db.query(`update public.communities set status = 'active' where slug = 'open-circle'`);
    await as(circle).post('/me/community', { slug: 'open-circle' });
    await as(friend).post('/me/community', { slug: 'open-circle' });
    const post = await newRequest(circle, 'Moving house this weekend.');
    const tapped = (await as(friend).post(`/posts/${post.id}/praying-now`, {})).json();
    expect(tapped.integrityText).not.toMatch(/Lord|God|pray/i);
    await drainJobs();
    const notice = (await as(circle).get('/me/notifications')).json().notifications.find((n: { kind: string }) => n.kind === 'praying_now');
    expect(notice.title).toContain('is thinking of you');
    expect(`${notice.title} ${notice.body}`).not.toMatch(/pray|Lord|God/i);
  });

  it('places a new member in the community their app names at sign-up, if it is active', async () => {
    await db.query(`update public.communities set status = 'active' where slug = 'open-circle'`);
    const id = randomUUID();
    await db.query(`insert into auth.users (id, email, raw_user_meta_data, aud, role) values ($1, $2, $3, 'authenticated', 'authenticated')`, [
      id,
      `${id}@test.local`,
      { display_name: 'Branded Ben', community: 'open-circle' },
    ]);
    expect((await as(id).get('/me')).json().community.slug).toBe('open-circle');

    await db.query(`update public.communities set status = 'hidden' where slug = 'open-circle'`);
    const later = randomUUID();
    await db.query(`insert into auth.users (id, email, raw_user_meta_data, aud, role) values ($1, $2, $3, 'authenticated', 'authenticated')`, [
      later,
      `${later}@test.local`,
      { display_name: 'Too Soon Sam', community: 'open-circle' },
    ]);
    expect((await as(later).get('/me')).json().community.slug).toBe('christian-ecumenical');
  });
});
