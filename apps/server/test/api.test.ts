import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as tokens from '../src/modules/tokens/index.js';
import { as, createUser, db, drainJobs, newRequest, setClassifier } from './helpers.js';

afterAll(() => db.end());

describe('accounts', () => {
  it('creates a profile on sign-up and saves onboarding answers', async () => {
    const u = await createUser('Ethel');
    const res = await as(u).patch('/me', {
      whyHere: ['pray_for_others'],
      supportOffered: ['grief'],
      prayForScope: ['family', 'world'],
      traumaContentOptOut: true,
      completeOnboarding: true,
    });
    expect(res.statusCode).toBe(200);
    const { profile } = res.json();
    expect(profile.display_name).toBe('Ethel');
    expect(profile.trauma_content_opt_out).toBe(true);
    expect(profile.onboarded_at).not.toBeNull();
  });

  it('follows and lists followers', async () => {
    const a = await createUser('Follower');
    const b = await createUser('Followee');
    expect((await as(a).put(`/people/${b}/follow`)).statusCode).toBe(200);
    const res = await as(b).get('/me/followers');
    expect(res.json().people.map((p: { id: string }) => p.id)).toContain(a);
  });

  it('rejects requests without a valid token', async () => {
    const { app } = await import('./helpers.js');
    expect((await app.inject({ method: 'GET', url: '/me' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/me', headers: { authorization: 'Bearer nope' } })).statusCode).toBe(401);
  });
});

describe('posts', () => {
  it('enforces the 1,000-word cap and applies the "more" preview', async () => {
    const u = await createUser('Writer');
    const tooLong = Array.from({ length: 1001 }, () => 'pray').join(' ');
    expect((await as(u).post('/posts', { postType: 'prayer_request', body: tooLong })).statusCode).toBe(400);
    const long = Array.from({ length: 100 }, () => 'faithful').join(' ');
    const res = await as(u).post('/posts', { postType: 'testimony', body: long });
    const { post } = res.json();
    expect(post.truncated).toBe(true);
    expect(post.preview.length).toBeLessThanOrEqual(200);
  });

  it('hides an anonymous author from everyone but the author', async () => {
    const author = await createUser('Secret');
    const reader = await createUser('Reader');
    const post = await newRequest(author, 'Pray for me in secret.', { isAnonymous: true });
    const asReader = (await as(reader).get(`/posts/${post.id}`)).json().post;
    expect(asReader.author).toEqual({ id: null, displayName: 'Anonymous', handle: null, anonymous: true, tier: null });
    const asAuthor = (await as(author).get(`/posts/${post.id}`)).json().post;
    expect(asAuthor.author.id).toBe(author);
    // The author link is still stored for tiers and tokens.
    const { rows } = await db.query('select user_id from public.posts where id = $1', [post.id]);
    expect(rows[0].user_id).toBe(author);
  });

  it('lets only the poster mark a request answered', async () => {
    const poster = await createUser('Poster');
    const other = await createUser('Other');
    const post = await newRequest(poster);
    expect((await as(other).post(`/posts/${post.id}/answered`)).statusCode).toBe(403);
    const res = await as(poster).post(`/posts/${post.id}/answered`);
    expect(res.json().post.state).toBe('answered');
    expect((await as(poster).post(`/posts/${post.id}/answered`)).statusCode).toBe(400);
  });

  it('threads comments and bumps the poster update into the first-comment slot', async () => {
    const poster = await createUser('Hector');
    const friend = await createUser('Friend');
    const post = await newRequest(poster);
    const c1 = (await as(friend).post(`/posts/${post.id}/comments`, { body: 'Standing with you.' })).json().comment;
    await as(poster).post(`/posts/${post.id}/comments`, { body: 'Thank you.', parentId: c1.id });
    expect((await as(friend).post(`/posts/${post.id}/comments`, { body: 'Fake update', isUpdate: true })).statusCode).toBe(403);
    await as(poster).post(`/posts/${post.id}/comments`, { body: 'Surgery went well!', isUpdate: true });
    const comments = (await as(friend).get(`/posts/${post.id}/comments`)).json().comments;
    expect(comments.map((c: { body: string; depth: number }) => [c.body, c.depth])).toEqual([
      ['Standing with you.', 0],
      ['Thank you.', 1],
      ['Surgery went well!', 0],
    ]);
    const card = (await as(friend).get(`/posts/${post.id}`)).json().post;
    expect(card.topComment.body).toBe('Surgery went well!');
  });

  it('caps encouragement notes at 77 characters', async () => {
    const poster = await createUser('P');
    const friend = await createUser('F');
    const post = await newRequest(poster);
    expect((await as(friend).post(`/posts/${post.id}/reactions`, { kind: 'encouragement', note: 'x'.repeat(78) })).statusCode).toBe(400);
    expect((await as(friend).post(`/posts/${post.id}/reactions`, { kind: 'encouragement', note: 'You are loved.' })).statusCode).toBe(201);
  });
});

describe('prayer loop', () => {
  it('Praying Now earns one token per post per day and tells the requester', async () => {
    const hector = await createUser('Hector');
    const ethel = await createUser('Ethel');
    const post = await newRequest(hector, 'Please pray for my son Luis.');

    const tap = await as(ethel).post(`/posts/${post.id}/praying-now`, { durationSeconds: 60 });
    expect(tap.statusCode).toBe(201);
    expect(tap.json().integrityText).toMatch(/right now/);
    await as(ethel).post(`/posts/${post.id}/praying-now`);
    await drainJobs();

    expect(await tokens.balanceOf(db, ethel)).toBe(1);
    const notes = (await as(hector).get('/me/notifications')).json().notifications;
    const praying = notes.filter((n: { kind: string }) => n.kind === 'praying_now');
    expect(praying).toHaveLength(1);
    expect(praying[0].title).toBe('Ethel is praying for you, Hector, right now');

    const card = (await as(hector).get(`/posts/${post.id}`)).json().post;
    expect(card.state).toBe('actively_prayed');
    expect(card.counts.prayingNow).toBe(2);
    const prayers = (await as(hector).get(`/posts/${post.id}/prayers`)).json();
    expect(prayers.count).toBe(1);
    expect(prayers.people[0].displayName).toBe('Ethel');
  });

  it('keeps an anonymous pray-er anonymous to the requester', async () => {
    const poster = await createUser('Ginni');
    const secret = await createUser('Quiet');
    const post = await newRequest(poster);
    await as(secret).post(`/posts/${post.id}/praying-now`, { isAnonymous: true });
    await drainJobs();
    const notes = (await as(poster).get('/me/notifications')).json().notifications;
    expect(notes[0].title).toBe('Someone is praying for you, Ginni, right now');
    expect(JSON.stringify(notes)).not.toContain(secret);
    const prayers = (await as(poster).get(`/posts/${post.id}/prayers`)).json();
    expect(prayers.people[0]).toMatchObject({ id: null, displayName: 'Anonymous' });
  });

  it('tracks commitments, sends due reminders, and counts check-ins', async () => {
    const poster = await createUser('Requester');
    const ethel = await createUser('Ethel');
    const post = await newRequest(poster);
    const res = await as(ethel).post(`/posts/${post.id}/commitments`, {
      frequency: 'daily',
      durationDays: 30,
      vowText: 'I will pray for Luis every day.',
    });
    expect(res.statusCode).toBe(201);
    const { commitment } = res.json();
    expect((await as(ethel).post(`/posts/${post.id}/commitments`, { frequency: 'daily', vowText: 'again' })).statusCode).toBe(400);

    await db.query(`update public.commitments set next_reminder_at = now() - interval '1 minute' where id = $1`, [commitment.id]);
    await db.query(`select graphile_worker.add_job('commitments_send_due_reminders', '{}')`);
    await drainJobs();
    const reminders = (await as(ethel).get('/me/notifications')).json().notifications.filter(
      (n: { kind: string }) => n.kind === 'commitment_reminder',
    );
    expect(reminders).toHaveLength(1);

    const checked = (await as(ethel).post(`/commitments/${commitment.id}/check-in`)).json().commitment;
    expect(checked.committed_count).toBe(1);
    expect(checked.completed_count).toBe(1);
    expect(new Date(checked.next_reminder_at).getTime()).toBeGreaterThan(Date.now());

    const snoozed = (await as(ethel).post(`/commitments/${commitment.id}/snooze`, { minutes: 30 })).json().commitment;
    expect(new Date(snoozed.next_reminder_at).getTime()).toBeLessThan(Date.now() + 31 * 60_000);

    const posterNotes = (await as(poster).get('/me/notifications')).json().notifications;
    expect(posterNotes.some((n: { kind: string }) => n.kind === 'commitment_made')).toBe(true);
  });

  it('lets the requester thank only people who prayed', async () => {
    const poster = await createUser('Thanker');
    const prayer = await createUser('PrayedOne');
    const bystander = await createUser('Bystander');
    const post = await newRequest(poster);
    await as(prayer).post(`/posts/${post.id}/praying-now`);
    const res = await as(poster).post(`/posts/${post.id}/thanks`, { recipientIds: [prayer, bystander], message: 'Thank you!' });
    expect(res.json().sent).toBe(1);
  });

  it('thanks everyone who prayed, anonymous pray-ers included, without revealing them', async () => {
    const poster = await createUser('Grateful');
    const named = await createUser('Named');
    const hidden = await createUser('Hidden');
    const post = await newRequest(poster);
    await as(named).post(`/posts/${post.id}/praying-now`);
    await as(hidden).post(`/posts/${post.id}/praying-now`, { isAnonymous: true });
    await as(poster).post(`/posts/${post.id}/praying-now`);
    const res = await as(poster).post(`/posts/${post.id}/thanks`, { message: 'Thank you all.' });
    expect(res.json()).toEqual({ sent: 2 });
    const notes = (await as(hidden).get('/me/notifications')).json().notifications;
    expect(notes.some((n: { kind: string }) => n.kind === 'thanks')).toBe(true);
  });
});

describe('feed', () => {
  it('pins the newest request, keeps zero-token requests visible, and respects the trauma opt-out', async () => {
    const poster = await createUser('Feeder');
    const booster = await createUser('Booster');
    const viewer = await createUser('Viewer');
    await as(viewer).patch('/me', { traumaContentOptOut: true });

    const plain = await newRequest(poster, 'A request with no tokens at all.');
    const boosted = await newRequest(poster, 'A boosted request.');
    const sensitive = await newRequest(poster, 'Graphic details of an accident.', { isSensitive: true });
    await tokens.earn(db, booster, 10, `t:${booster}:earn`, 'test');
    expect((await as(booster).post(`/posts/${boosted.id}/boost`, { amount: 10, idempotencyKey: 'b1' })).statusCode).toBe(200);
    const latest = await newRequest(poster, 'Newest request.');

    const feed = (await as(viewer).get('/feed?pageSize=50')).json();
    const ids = feed.posts.map((p: { id: string }) => p.id);
    expect(ids[0]).toBe(latest.id);
    expect(feed.pinnedId).toBe(latest.id);
    expect(ids).toContain(plain.id);
    expect(ids).toContain(boosted.id);
    expect(ids).not.toContain(sensitive.id);
    expect(ids.indexOf(boosted.id)).toBeLessThan(ids.indexOf(plain.id));
  });

  it('refuses a boost the member cannot afford', async () => {
    const poster = await createUser('X');
    const broke = await createUser('Broke');
    const post = await newRequest(poster);
    const res = await as(broke).post(`/posts/${post.id}/boost`, { amount: 1, idempotencyKey: 'b' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('insufficient_tokens');
  });
});

describe('moderation', () => {
  it('auto-hides only severe AI flags, and only humans apply penalties', async () => {
    const author = await createUser('Troll');
    const moderator = await createUser('Mod');
    const member = await createUser('Member');
    await grantRole(db, moderator, 'moderator', null);
    await tokens.earn(db, author, 5, `t:${author}:earn`, 'test');

    const flag = (category: string) => ({ flagged: true, categories: { [category]: true }, category_scores: { [category]: 0.9 } });
    setClassifier(async (text) => (text.includes('kill') ? flag('harassment/threatening') : text.includes('rude') ? flag('harassment') : null));
    const severe = await newRequest(author, 'I pray we kill them all.');
    const mild = await newRequest(author, 'A rude prayer.');
    await drainJobs();
    setClassifier(async () => null);

    expect((await as(member).get(`/posts/${severe.id}`)).statusCode).toBe(404);
    expect((await as(member).get(`/posts/${mild.id}`)).statusCode).toBe(200);

    expect((await as(member).get('/moderation/queue')).statusCode).toBe(403);
    const queue = (await as(moderator).get('/moderation/queue')).json().items;
    const item = queue.find((i: { target_id: string }) => i.target_id === severe.id);
    expect(item.auto_hidden).toBe(true);
    expect(await tokens.balanceOf(db, author)).toBe(5);

    const decision = await as(moderator).post(`/moderation/items/${item.id}/decision`, {
      action: 'remove',
      forfeitTokens: 'all',
      suspendDays: 7,
      note: 'Harm prayers are forbidden.',
    });
    expect(decision.statusCode).toBe(200);
    expect(await tokens.balanceOf(db, author)).toBe(0);
    const { rows } = await db.query('select action from public.moderation_actions where moderation_item_id = $1 order by id', [item.id]);
    expect(rows.map((r) => r.action)).toEqual(['remove', 'forfeit_tokens', 'suspend']);
    expect((await as(author).post('/posts', { postType: 'open_prayer', body: 'hi' })).statusCode).toBe(403);
    expect((await as(moderator).post(`/moderation/items/${item.id}/decision`, { action: 'dismiss' })).statusCode).toBe(409);
  });

  it('accepts member reports into the queue', async () => {
    const author = await createUser('Spammer');
    const reporter = await createUser('Reporter');
    const post = await newRequest(author, 'Buy my product!');
    const res = await as(reporter).post('/reports', { targetType: 'post', targetId: post.id, reason: 'Advertising' });
    expect(res.statusCode).toBe(201);
  });
});

describe('communities', () => {
  it('puts every member and post in the default community and scopes the feed by membership', async () => {
    const a = await createUser('InDefault');
    const outsider = await createUser('Elsewhere');
    const { rows } = await db.query(
      `insert into public.communities (slug, name, tradition) values ('test-' || substr(md5(random()::text), 1, 8), 'Test', 'test') returning id`,
    );
    await db.query('update public.community_memberships set community_id = $2 where user_id = $1', [outsider, rows[0].id]);

    const post = await newRequest(a, 'Default community request.');
    const { rows: p } = await db.query('select community_id = public.default_community_id() as is_default from public.posts where id = $1', [post.id]);
    expect(p[0].is_default).toBe(true);

    const ids = (u: string) => as(u).get('/feed?pageSize=50').then((r) => r.json().posts.map((x: { id: string }) => x.id));
    expect(await ids(a)).toContain(post.id);
    expect(await ids(outsider)).not.toContain(post.id);
  });
});

describe('themed feed cards', () => {
  it('returns the community default theme and layout-neutral cards', async () => {
    const poster = await createUser('Card');
    const viewer = await createUser('Looker');
    const post = await newRequest(poster);
    await as(viewer).post(`/posts/${post.id}/commitments`, { frequency: 'daily', vowText: 'Daily' });
    const feed = (await as(viewer).get('/feed?pageSize=50')).json();
    expect(feed.theme).toMatchObject({ slug: 'column', layout: 'column' });
    const card = feed.posts.find((p: { id: string }) => p.id === post.id);
    expect(card).toMatchObject({ cardType: 'prayer_request', myCommitment: { frequency: 'daily' } });
    expect(card.branchKey).toMatch(/^[0-9a-f]{16}$/);
    expect(card.actions).toEqual(['praying_now', 'commit', 'encouragement', 'well_wishes', 'share', 'gift_tokens']);
    const anon = await newRequest(poster, 'Anonymous one.', { isAnonymous: true });
    expect((await as(viewer).get(`/posts/${anon.id}`)).json().post.branchKey).toBeNull();
  });
});
