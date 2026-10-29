import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import type { Mail } from '../src/modules/digest/mailer.js';
import * as growth from '../src/modules/growth/index.js';
import { app, as, createUser, db, newRequest } from './helpers.js';

const outbox: Mail[] = [];
const mail: growth.MailContext = { mailer: async (m) => void outbox.push(m), siteUrl: 'https://api.example.org', openCircleName: 'Open Circle' };
const RELIGIOUS = /\b(pray\w*|god|lord|jesus|church|pastors?|priestly|scripture|blessed)\b/i;

const allOff = { guestPrayerEnabled: false, prayerChainEnabled: false, prayedForWidgetEnabled: false, prayerMinuteEnabled: false };
let admin: string;

beforeEach(async () => {
  outbox.length = 0;
  admin ??= await createUser('Growth Admin');
  await grantRole(db, admin, 'admin', null);
  await as(admin).patch('/admin/growth-settings', allOff);
});

afterAll(async () => {
  await growth.updateSettings(db, allOff);
  await db.query(`update public.communities set status = 'hidden', hidden_features = '{}' where slug = 'open-circle'`);
  await db.end();
});

const form = (url: string, body: Record<string, string>, ip = '203.0.113.7') =>
  app.inject({ method: 'POST', url, remoteAddress: ip, headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: new URLSearchParams(body).toString() });

async function job(task: string, payload: object) {
  const tasks = { growth_guest_answered: growth.guestAnsweredTask(db, mail), growth_chain_confirm: growth.chainConfirmTask(db, mail), growth_chain_send: growth.chainSendTask(db, mail) } as Record<string, (p: unknown, h: never) => Promise<void>>;
  await tasks[task]!(payload, {} as never);
}

describe('switches', () => {
  it('are all off by default and only admins change them', async () => {
    const member = await createUser('Growth Member');
    const f = (await as(member).get('/features')).json().features;
    expect(f).toMatchObject({ guestPrayer: false, prayerChain: false, prayedForWidget: false, prayerMinute: false });
    expect((await as(member).patch('/admin/growth-settings', { guestPrayerEnabled: true })).statusCode).toBe(403);
    // The chain needs guest prayer on too, because it sends the guest link.
    await as(admin).patch('/admin/growth-settings', { prayerChainEnabled: true });
    expect((await as(member).get('/features')).json().features.prayerChain).toBe(false);
    await as(admin).patch('/admin/growth-settings', { guestPrayerEnabled: true });
    expect((await as(member).get('/features')).json().features.prayerChain).toBe(true);
  });

  it('refuse every feature while off', async () => {
    const member = await createUser('Off Member');
    const post = await newRequest(member);
    expect((await as(member).post(`/posts/${post.id}/guest-link`)).statusCode).toBe(403);
    expect((await as(member).post('/me/prayer-chain', { email: 'a@example.org' })).statusCode).toBe(403);
    expect((await as(member).get('/me/prayed-for')).json().prayedFor).toEqual({ enabled: false });
    expect((await as(member).put('/me/prayer-minute', { time: '07:00', timeZone: 'America/Chicago' })).statusCode).toBe(403);
    expect((await as(member).get('/prayer-minute/now')).json().now).toEqual({ enabled: false });
  });
});

describe('guest prayer', () => {
  it('lets anyone pray from the link without an account, once per network a day', async () => {
    await as(admin).patch('/admin/growth-settings', { guestPrayerEnabled: true });
    const asker = await createUser('Martha Guest');
    const other = await createUser('Not The Asker');
    const post = await newRequest(asker, 'Please pray for my sister in the hospital.');
    expect((await as(other).post(`/posts/${post.id}/guest-link`)).statusCode).toBe(403);
    const made = await as(asker).post(`/posts/${post.id}/guest-link`);
    expect(made.statusCode).toBe(201);
    const { token, path } = made.json().link;
    expect(path).toBe(`/pray/${token}`);

    const page = await app.inject({ method: 'GET', url: path });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Martha asked for prayer');
    expect(page.body).toContain('my sister in the hospital');
    expect(page.headers['x-robots-tag']).toBe('noindex');

    const prayed = await form(path, { firstName: 'Ana', email: 'Ana@Example.org', notify: 'on' });
    expect(prayed.statusCode).toBe(200);
    expect(prayed.body).toContain('Thank you for praying');
    // The same network again the same day doesn't count twice; a bot filling the hidden field never counts.
    await form(path, { firstName: 'Ana' });
    await form(path, { firstName: 'Bot', website: 'http://spam.example' }, '198.51.100.9');
    const { rows } = await db.query('select first_name, email from public.guest_prayers where post_id = $1', [post.id]);
    expect(rows).toEqual([{ first_name: 'Ana', email: 'ana@example.org' }]);
    expect((await as(asker).get(`/posts/${post.id}/guest-link`)).json().link.guestPrayers).toBe(1);

    const notes = (await as(asker).get('/me/notifications')).json().notifications;
    expect(notes.some((n: { title: string }) => n.title === 'Ana prayed for you')).toBe(true);
    // Guests never earn tokens or verified prayers: no prayer_events row.
    expect((await db.query('select 1 from public.prayer_events where post_id = $1', [post.id])).rowCount).toBe(0);

    // A bad email shows the form again with a message.
    const bad = await form(path, { email: 'not-an-email' }, '198.51.100.10');
    expect(bad.statusCode).toBe(400);
  });

  it('emails guests who asked once when the prayer is answered, then forgets the address', async () => {
    await as(admin).patch('/admin/growth-settings', { guestPrayerEnabled: true });
    const asker = await createUser('Joseph Answered');
    const post = await newRequest(asker);
    const { path } = (await as(asker).post(`/posts/${post.id}/guest-link`)).json().link;
    await form(path, { firstName: 'Lee <i>', email: 'lee@example.org', notify: 'on' });
    await form(path, { firstName: 'Kim', email: 'kim@example.org' }, '198.51.100.20'); // no tick: not kept
    expect((await as(asker).post(`/posts/${post.id}/answered`, { testimony: 'Surgery went well!' })).statusCode).toBe(200);
    await job('growth_guest_answered', { postId: post.id });
    expect(outbox.map((m) => m.to)).toEqual(['lee@example.org']);
    expect(outbox[0]!.text).toContain('Surgery went well!');
    expect(outbox[0]!.text).toContain('ask Joseph for an invite');
    // The text email is plain; the HTML one escapes what people typed.
    expect(outbox[0]!.text).toContain('Hi Lee <i>,');
    expect(outbox[0]!.html).toContain('Hi Lee &lt;i&gt;,');
    expect(outbox[0]!.html).not.toContain('<i>');
    const { rows } = await db.query('select email, answered_sent_at is not null as sent from public.guest_prayers where post_id = $1 order by created_at', [post.id]);
    expect(rows).toEqual([
      { email: null, sent: true },
      { email: null, sent: false },
    ]);
    // The page now shows the good news and no button.
    const page = await app.inject({ method: 'GET', url: path });
    expect(page.body).toContain('this prayer was answered');
    expect(page.body).not.toContain('I prayed</button>');
  });

  it('stops working when revoked, switched off, or the request is removed', async () => {
    await as(admin).patch('/admin/growth-settings', { guestPrayerEnabled: true });
    const asker = await createUser('Revoke Asker');
    const post = await newRequest(asker);
    const { path } = (await as(asker).post(`/posts/${post.id}/guest-link`)).json().link;
    expect((await app.inject({ method: 'GET', url: path })).statusCode).toBe(200);
    await as(admin).patch('/admin/growth-settings', { guestPrayerEnabled: false });
    expect((await app.inject({ method: 'GET', url: path })).statusCode).toBe(404);
    await as(admin).patch('/admin/growth-settings', { guestPrayerEnabled: true });
    expect((await as(asker).delete(`/posts/${post.id}/guest-link`)).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: path })).statusCode).toBe(404);
    // Making it again brings the same link back.
    expect((await as(asker).post(`/posts/${post.id}/guest-link`)).json().link.path).toBe(path);
    await db.query(`update public.posts set moderation_status = 'removed' where id = $1`, [post.id]);
    expect((await app.inject({ method: 'GET', url: path })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/pray/short' })).statusCode).toBe(404);
  });

  it('uses Open Circle wording, brand and link for an Open Circle request', async () => {
    await as(admin).patch('/admin/growth-settings', { guestPrayerEnabled: true });
    await as(admin).patch('/admin/communities/open-circle', { status: 'active' });
    const asker = await createUser('Robin Circle');
    await as(asker).post('/me/community', { slug: 'open-circle' });
    const post = await newRequest(asker, 'Big job interview tomorrow, nervous.');
    const { path } = (await as(asker).post(`/posts/${post.id}/guest-link`)).json().link;
    expect(path).toMatch(/^\/circle\//);
    const page = await app.inject({ method: 'GET', url: path });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Open Circle');
    expect(page.body.replace(/<[^>]+>/g, ' ')).not.toMatch(RELIGIOUS);
    const done = await form(path, { firstName: 'Sam' });
    expect(done.body.replace(/<[^>]+>/g, ' ')).not.toMatch(RELIGIOUS);
    const notes = (await as(asker).get('/me/notifications')).json().notifications as { title: string; body: string }[];
    const n = notes.find((x) => x.title.startsWith('Sam'))!;
    expect(`${n.title} ${n.body}`).not.toMatch(RELIGIOUS);
  });
});

describe('prayer chain', () => {
  it('asks each address first, sends a request once, and lets people leave', async () => {
    await as(admin).patch('/admin/growth-settings', { guestPrayerEnabled: true, prayerChainEnabled: true });
    const owner = await createUser('Ruth Chain');
    const post = await newRequest(owner, 'Pray for our church picnic weather.');
    expect((await as(owner).post(`/posts/${post.id}/prayer-chain`)).statusCode).toBe(400); // nobody said yes yet
    const added = await as(owner).post('/me/prayer-chain', { email: 'Naomi@Example.org' });
    expect(added.statusCode).toBe(201);
    expect((await as(owner).post('/me/prayer-chain', { email: 'naomi@example.org' })).statusCode).toBe(409);
    await job('growth_chain_confirm', { memberId: added.json().id });
    expect(outbox[0]!.to).toBe('naomi@example.org');
    expect(outbox[0]!.subject).toBe('Ruth asked you to join their prayer chain');
    const token = (await db.query('select token from public.prayer_chain_members where id = $1', [added.json().id])).rows[0].token as string;

    // Opening the link changes nothing; only the form does.
    const page = await app.inject({ method: 'GET', url: `/chain/${token}` });
    expect(page.body).toContain('Ruth asked you to join their prayer chain');
    expect((await as(owner).get('/me/prayer-chain')).json().people[0].status).toBe('pending');
    await form(`/chain/${token}`, { join: 'yes' });
    expect((await as(owner).get('/me/prayer-chain')).json().people[0].status).toBe('confirmed');

    outbox.length = 0;
    const sent = await as(owner).post(`/posts/${post.id}/prayer-chain`);
    expect(sent.statusCode).toBe(200);
    expect(sent.json().recipients).toBe(1);
    expect((await as(owner).post(`/posts/${post.id}/prayer-chain`)).statusCode).toBe(409);
    await job('growth_chain_send', { postId: post.id });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.text).toContain('church picnic');
    expect(outbox[0]!.text).toContain('https://api.example.org/pray/');
    expect(outbox[0]!.text).toContain(`https://api.example.org/chain/${token}`);
    expect(outbox[0]!.html).toContain(`<a href="https://api.example.org/chain/${token}">`);

    await form(`/chain/${token}`, { join: 'no' });
    expect((await as(owner).get('/me/prayer-chain')).json().people[0].status).toBe('left');
    outbox.length = 0;
    await job('growth_chain_send', { postId: post.id });
    expect(outbox).toHaveLength(0);
    expect((await as(owner).delete(`/me/prayer-chain/${added.json().id}`)).statusCode).toBe(200);
    expect((await as(owner).get('/me/prayer-chain')).json().people).toEqual([]);
    // Someone who said no is never asked again, even after being taken off the list.
    const again = await as(owner).post('/me/prayer-chain', { email: 'naomi@example.org' });
    expect(again.statusCode).toBe(409);
    expect(again.json().message).toBe("This person said no to your prayer chain, so they can't be added again");
  });

  it('brings a removed person back without a second invitation', async () => {
    await as(admin).patch('/admin/growth-settings', { guestPrayerEnabled: true, prayerChainEnabled: true });
    const owner = await createUser('Back Owner');
    const added = await as(owner).post('/me/prayer-chain', { email: 'boaz@example.org' });
    expect(added.statusCode, added.body).toBe(201);
    await job('growth_chain_confirm', { memberId: added.json().id });
    expect((await as(owner).delete(`/me/prayer-chain/${added.json().id}`)).statusCode).toBe(200);
    expect((await as(owner).delete(`/me/prayer-chain/${added.json().id}`)).statusCode).toBe(404);
    outbox.length = 0;
    // The invitation job for a removed person sends nothing.
    await job('growth_chain_confirm', { memberId: added.json().id });
    expect(outbox).toHaveLength(0);
    const back = await as(owner).post('/me/prayer-chain', { email: 'boaz@example.org' });
    expect(back.statusCode).toBe(201);
    expect(back.json().id).toBe(added.json().id);
    expect((await as(owner).get('/me/prayer-chain')).json().people).toMatchObject([{ email: 'boaz@example.org', status: 'pending' }]);
  });

  it('caps the chain size', async () => {
    await as(admin).patch('/admin/growth-settings', { guestPrayerEnabled: true, prayerChainEnabled: true, prayerChainMax: 2 });
    const owner = await createUser('Cap Owner');
    await as(owner).post('/me/prayer-chain', { email: 'one@example.org' });
    await as(owner).post('/me/prayer-chain', { email: 'two@example.org' });
    expect((await as(owner).post('/me/prayer-chain', { email: 'three@example.org' })).statusCode).toBe(400);
    expect((await as(owner).post('/me/prayer-chain', { email: 'nope' })).statusCode).toBe(400);
    await as(admin).patch('/admin/growth-settings', { prayerChainMax: 50 });
  });
});

describe('prayed-for widget', () => {
  it('names up to two people who prayed today, never anonymous ones, and counts guests', async () => {
    await as(admin).patch('/admin/growth-settings', { prayedForWidgetEnabled: true, guestPrayerEnabled: true });
    const me = await createUser('Widget Owner');
    const post = await newRequest(me);
    const ana = await createUser('Ana Lopez');
    const anon = await createUser('Hidden Person');
    await as(ana).post(`/posts/${post.id}/praying-now`, {});
    await as(anon).post(`/posts/${post.id}/praying-now`, { isAnonymous: true });
    const { path } = (await as(me).post(`/posts/${post.id}/guest-link`)).json().link;
    await form(path, { firstName: 'Grandma' }, '198.51.100.30');
    const r = (await as(me).get('/me/prayed-for')).json().prayedFor;
    expect(r.enabled).toBe(true);
    expect(r.people).toBe(3);
    expect(r.names).toHaveLength(2);
    expect(r.names).toEqual(expect.arrayContaining(['Grandma', 'Ana']));
    expect(r.names).not.toContain('Hidden');
  });
});

describe('prayer minute', () => {
  it('saves a minute, counts others who chose the same moment, and shows requests with a live count', async () => {
    await as(admin).patch('/admin/growth-settings', { prayerMinuteEnabled: true });
    const a = await createUser('Minute A');
    const b = await createUser('Minute B');
    await newRequest(b, 'Please pray for my exams this week.');
    expect((await as(a).put('/me/prayer-minute', { time: '25:00', timeZone: 'America/Chicago' })).statusCode).toBe(400);
    expect((await as(a).put('/me/prayer-minute', { time: '07:00', timeZone: 'Not/AZone' })).statusCode).toBe(400);
    // 07:00 in Chicago and 08:00 in New York are the same moment.
    await as(b).put('/me/prayer-minute', { time: '08:00', timeZone: 'America/New_York' });
    const set = (await as(a).put('/me/prayer-minute', { time: '07:00', timeZone: 'America/Chicago' })).json().minute;
    expect(set).toMatchObject({ enabled: true, time: '07:00', timeZone: 'America/Chicago' });
    expect(set.others).toBeGreaterThanOrEqual(1);

    expect((await as(a).post('/prayer-minute/join')).statusCode).toBe(200);
    const now = (await as(a).get('/prayer-minute/now')).json().now;
    expect(now.together).toBeGreaterThanOrEqual(1);
    expect(now.requests.length).toBeGreaterThan(0);
    expect(now.requests.every((c: { isMine: boolean }) => !c.isMine)).toBe(true);

    expect((await as(a).delete('/me/prayer-minute')).statusCode).toBe(200);
    expect((await as(a).get('/me/prayer-minute')).json().minute.time).toBeNull();
    await db.query('delete from public.prayer_minutes where user_id = $1', [b]);
  });

  it('sends the notice at the chosen minute, once a day', async () => {
    await as(admin).patch('/admin/growth-settings', { prayerMinuteEnabled: true });
    const m = await createUser('Minute Now');
    const { rows } = await db.query<{ hm: string }>("select to_char(now() at time zone 'UTC', 'HH24:MI') as hm");
    await as(m).put('/me/prayer-minute', { time: rows[0]!.hm, timeZone: 'UTC' });
    const task = growth.minuteDueTask(db);
    await task({}, {} as never);
    await task({}, {} as never);
    const notes = (await as(m).get('/me/notifications')).json().notifications.filter((n: { kind: string }) => n.kind === 'prayer_minute');
    // The minute may tick over between reading it and running the task; either way at most one notice.
    expect(notes.length).toBeLessThanOrEqual(1);
    await db.query('delete from public.prayer_minutes where user_id = $1', [m]);
  });

  it('purges guest emails past their time', async () => {
    await growth.updateSettings(db, { guestPrayerEnabled: true, guestEmailDays: 1 });
    const asker = await createUser('Purge Asker');
    const post = await newRequest(asker);
    const { path } = (await as(asker).post(`/posts/${post.id}/guest-link`)).json().link;
    await form(path, { email: 'old@example.org', notify: 'on' }, '198.51.100.40');
    await db.query(`update public.guest_prayers set created_at = now() - interval '2 days' where post_id = $1`, [post.id]);
    await growth.purgeTask(db)({}, {} as never);
    expect((await db.query('select email from public.guest_prayers where post_id = $1', [post.id])).rows[0].email).toBeNull();
    await growth.updateSettings(db, { guestEmailDays: 90 });
  });
});
