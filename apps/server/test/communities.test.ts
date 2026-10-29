import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { buildDigest, renderDigest } from '../src/modules/digest/index.js';
import * as prompts from '../src/modules/prompts/index.js';
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
    // The sign-up and reset emails read the community from auth metadata (supabase/templates).
    const meta = async (id: string) => (await db.query(`select raw_user_meta_data ->> 'community' as c from auth.users where id = $1`, [id])).rows[0].c;
    expect(await meta(circle)).toBe('open-circle');
    expect(await meta(christian)).not.toBe('open-circle');

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

  it('lets admins add a hidden community for a denomination or a partner, with its own wording', async () => {
    const admin = await createUser('Sandbox Admin');
    await grantRole(db, admin, 'admin', null);
    const member = await createUser('Sandbox Sam');
    // Unique short names, so the test passes again on a database that wasn't reset.
    const tag = randomUUID().slice(0, 8);
    const grace = `grace-lutheran-${tag}`;
    const kind = `kind-town-${tag}`;
    const input = { slug: grace, name: 'Grace Lutheran', tradition: 'Lutheran', operatorName: 'Grace Lutheran Church', operatorContact: 'office@grace.example' };
    expect((await as(member).post('/admin/communities', input)).statusCode).toBe(403);
    const made = await as(admin).post('/admin/communities', input);
    expect(made.statusCode).toBe(201);
    expect(made.json().community).toMatchObject({ slug: grace, tradition: 'lutheran', status: 'hidden', wording: 'faith', operatorName: 'Grace Lutheran Church' });
    expect((await as(admin).post('/admin/communities', input)).statusCode).toBe(409);
    // Hidden until turned on: members can't pick it.
    expect((await as(member).post('/me/community', { slug: grace })).statusCode).toBe(404);
    const listed = (await as(admin).get('/admin/communities')).json().communities.find((c: { slug: string }) => c.slug === grace);
    expect(listed).toMatchObject({ members: 0, operatorContact: 'office@grace.example' });

    // A neutral community never offers confession, and its members read the neutral wording.
    const made2 = (
      await as(admin).post('/admin/communities', { slug: kind, name: 'Kind Town', tradition: 'humanist', wording: 'neutral', enabledPostTypes: ['prayer_request', 'confessional'] })
    ).json().community;
    expect(made2).toMatchObject({ wording: 'neutral', enabledPostTypes: ['prayer_request'] });
    await as(admin).patch(`/admin/communities/${kind}`, { status: 'active' });
    await as(member).post('/me/community', { slug: kind });
    expect((await as(member).get('/me')).json().community).toMatchObject({ slug: kind, wording: 'neutral' });
    expect((await as(member).get('/me/commitments/review')).json().message).not.toMatch(/pray/i);

    // Wording and details can change later; null clears a detail.
    const changed = (await as(admin).patch(`/admin/communities/${grace}`, { wording: 'neutral', operatorName: null })).json().community;
    expect(changed).toMatchObject({ wording: 'neutral', operatorName: null, name: 'Grace Lutheran' });
    await db.query(`update public.communities set status = 'archived' where slug = any($1)`, [[grace, kind]]);
  });

  it('sums up the week without religious words for Open Circle members', async () => {
    const circle = await createUser('Weekly Wren');
    const friend = await createUser('Weekly Will');
    await db.query(`update public.communities set status = 'active' where slug = 'open-circle'`);
    await as(circle).post('/me/community', { slug: 'open-circle' });
    await as(friend).post('/me/community', { slug: 'open-circle' });
    expect((await as(circle).get('/me/commitments/review')).json().message).toBe('When you are ready, there are people who could use some support.');
    const post = await newRequest(friend, 'A long week ahead.');
    await as(circle).post(`/posts/${post.id}/praying-now`, {});
    const review = (await as(circle).get('/me/commitments/review')).json();
    expect(review.message).toBe('This week you supported people 1 time on 1 request. Thank you for being there for them.');
    expect(review.message).not.toMatch(/pray/i);
    const faith = await createUser('Weekly Faith');
    expect((await as(faith).get('/me/commitments/review')).json().message).toContain('people waiting for prayer');
  });

  it('sends Open Circle members the weekly email without religious words', async () => {
    const circle = await createUser('Digest Dot');
    const friend = await createUser('Digest Dan');
    await db.query(`update public.communities set status = 'active' where slug = 'open-circle'`);
    await as(circle).post('/me/community', { slug: 'open-circle' });
    await as(friend).post('/me/community', { slug: 'open-circle' });
    const post = await newRequest(friend, 'Starting a new job.');
    await as(circle).post(`/posts/${post.id}/praying-now`, {});
    const mail = renderDigest(await buildDigest(db, circle), 'en', 'dot@example.com', true);
    for (const text of [mail.subject, mail.text, mail.html]) expect(text).not.toMatch(/pray|\bgod\b|bless|faith/i);
    expect(mail.text).toContain('You showed up 1 time for 1 request.');
  });

  it('keeps a post from another community out of reach, even by its link', async () => {
    const circle = await createUser('Sandbox Sam');
    const faith = await createUser('Sandbox Faith');
    await db.query(`update public.communities set status = 'active' where slug = 'open-circle'`);
    await as(circle).post('/me/community', { slug: 'open-circle' });
    const post = await newRequest(faith, 'A faith request.');
    expect((await as(circle).get(`/posts/${post.id}`)).statusCode).toBe(404);
    expect((await as(circle).post(`/posts/${post.id}/praying-now`, {})).statusCode).toBe(404);
    expect((await as(circle).get(`/posts/${post.id}/comments`)).statusCode).toBe(404);
    expect((await as(circle).get(`/posts/${post.id}/prayers`)).statusCode).toBe(404);
    expect((await as(circle).post(`/posts/${post.id}/boost`, { amount: 1, idempotencyKey: 'sandbox' })).statusCode).toBe(404);
    expect((await as(faith).get(`/posts/${post.id}`)).statusCode).toBe(200);
    // Their profile page doesn't list it either.
    const page = (await as(circle).get(`/people/${faith}`)).json();
    expect(page.posts.map((p: { id: string }) => p.id)).not.toContain(post.id);
    expect((await as(faith).get(`/people/${faith}`)).json().posts.map((p: { id: string }) => p.id)).toContain(post.id);
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

  it('never prompts an Open Circle member to pray for a followed faith request', async () => {
    const friend = await createUser('Faith Fran');
    const circle = await createUser('Circle Cal');
    await db.query('insert into public.follows (user_id, followee_id) values ($1, $2)', [circle, friend]);
    await newRequest(friend, 'Pray for my surgery.');
    await db.query('delete from public.community_memberships where user_id = $1', [circle]);
    await db.query(
      `insert into public.community_memberships (community_id, user_id, is_primary) select id, $1, true from public.communities where slug = 'open-circle'`,
      [circle],
    );
    expect(await prompts.next(db, circle, new Date(Date.now() + 60_000))).toBeNull();
  });
});
