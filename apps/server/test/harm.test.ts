// Harmful prayer requests (docs/HARMFUL_PRAYERS.md): held or reviewed by a person,
// never auto-blocked unless pure junk, and never sent by radio until cleared.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as harm from '../src/modules/harm/index.js';
import * as tokens from '../src/modules/tokens/index.js';
import { as, createUser, db } from './helpers.js';

const tokenDefaults = await tokens.settings(db);
const harmDefaults = await harm.settings(db);
let moderator: string;
let admin: string;

beforeAll(async () => {
  moderator = await createUser('Shepherd');
  admin = await createUser('Keeper');
  await grantRole(db, moderator, 'moderator', null);
  await grantRole(db, admin, 'admin', null);
  await tokens.updateSettings(db, { radio_funding: 'free' });
});
afterAll(async () => {
  await harm.updateSettings(db, harmDefaults);
  await tokens.updateSettings(db, tokenDefaults);
  await db.end();
});

const post = (userId: string, body: string) => as(userId).post('/posts', { postType: 'prayer_request', body });
const queueItem = async (targetId: string) =>
  (await as(moderator).get(`/moderation/queue?targetId=${targetId}`)).json().items.find((i: { source: string }) => i.source === 'harm');
const status = async (id: string) => (await db.query('select moderation_status, harm_category from public.posts where id = $1', [id])).rows[0];

describe('harmful prayers', () => {
  it('is off by default', async () => {
    expect(harmDefaults.enabled).toBe(false);
    const res = await post(await createUser('Angry'), 'I pray that he dies.');
    expect(res.statusCode).toBe(201);
    expect(res.json().harm).toBeNull();
    expect(await status(res.json().post.id)).toEqual({ moderation_status: 'visible', harm_category: null });
  });

  it('lets an admin switch it on and set each category', async () => {
    expect((await as(moderator).patch('/admin/harm-settings', { enabled: true })).statusCode).toBe(403);
    const res = await as(admin).patch('/admin/harm-settings', { enabled: true, flood_per_day: 5 });
    expect(res.json().settings).toMatchObject({ enabled: true, threat_action: 'hold', harm_wish_action: 'review', abuse_action: 'support' });
  });

  it('holds a threat out of sight for a person, and keeps it off the radio', async () => {
    const poster = await createUser('Furious');
    const res = await post(poster, "I'm going to kill him if he touches my kids again.");
    expect(res.statusCode).toBe(201);
    expect(res.json().harm).toMatchObject({ category: 'threat', action: 'hold' });
    const id = res.json().post.id;
    expect(await status(id)).toEqual({ moderation_status: 'hidden_pending_review', harm_category: 'threat' });
    expect(await queueItem(id)).toMatchObject({ reason: 'Possible threat: a person should read this', auto_hidden: true });
    expect((await as(poster).post(`/posts/${id}/radio`, { idempotencyKey: 'threat-1' })).statusCode).not.toBe(201);
    expect((await db.query('select 1 from public.radio_prayers where post_id = $1', [id])).rows).toHaveLength(0);
  });

  it('keeps a prayer for harm up, but off the radio until a moderator clears it', async () => {
    const poster = await createUser('Wronged');
    const res = await post(poster, 'Lord, I pray my ex suffers for what she did to our family.');
    expect(res.json().harm).toMatchObject({ category: 'harm_wish', action: 'review' });
    expect(res.json().harm.message).toMatch(/justice/);
    const id = res.json().post.id;
    expect(await status(id)).toEqual({ moderation_status: 'visible', harm_category: 'harm_wish' });
    expect((await as(poster).post(`/posts/${id}/radio`, { idempotencyKey: 'wish-1' })).statusCode).toBe(409);
    const item = await queueItem(id);
    expect(item.reason).toBe('Prayer for someone to be harmed');
    await as(moderator).post(`/moderation/items/${item.id}/decision`, { action: 'dismiss', note: 'Venting; talked with them.' });
    expect((await status(id)).harm_category).toBeNull();
    expect((await as(poster).post(`/posts/${id}/radio`, { idempotencyKey: 'wish-2' })).statusCode).toBe(201);
  });

  it('never hides someone disclosing abuse, and offers them hotlines privately', async () => {
    const poster = await createUser('Survivor');
    const res = await post(poster, 'My husband hits me when he drinks. Please pray for me and my kids.');
    expect(res.json().harm).toMatchObject({ category: 'abuse_disclosure', action: 'support' });
    expect(res.json().harm.resources.map((r: { url: string }) => r.url)).toContain('tel:18007997233');
    const id = res.json().post.id;
    expect((await status(id)).moderation_status).toBe('visible');
    expect((await queueItem(id)).reason).toMatch(/abused/);
    const { rows } = await db.query(`select body from public.notifications where user_id = $1 and kind = 'support_resources'`, [poster]);
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toMatch(/1-800-799-7233/);
  });

  it('allows swearing out of anguish, and refuses only text that is nothing but swearing', async () => {
    const poster = await createUser('Grieving');
    const anguish = await post(poster, 'God, why the fuck did you take my baby? I am so damn angry and lost.');
    expect(anguish.statusCode).toBe(201);
    expect(anguish.json().harm).toBeNull();
    const junk = await post(poster, 'fuck shit fuck bitch');
    expect(junk.statusCode).toBe(422);
    expect(junk.json().message).toMatch(/what happened/);
  });

  it('holds a threatening comment and a threatening message', async () => {
    const author = await createUser('Author');
    const other = await createUser('Other');
    const p = (await post(author, 'Pray for my week.')).json().post;
    const c = await as(other).post(`/posts/${p.id}/comments`, { body: 'I will hurt you if you post again.' });
    expect(c.json().comment.harm).toMatchObject({ category: 'threat', action: 'hold' });
    const { rows } = await db.query('select moderation_status, harm_category from public.comments where id = $1', [c.json().comment.id]);
    expect(rows[0]).toEqual({ moderation_status: 'hidden_pending_review', harm_category: 'threat' });
  });

  it('gives the gentle word before posting', async () => {
    const res = await as(await createUser('Writer')).post('/moderation/precheck', { text: 'Help me get revenge on my brother.' });
    expect(res.json().harm).toMatchObject({ category: 'revenge', title: expect.any(String), message: expect.stringMatching(/Romans 12:19/) });
    expect((await as(await createUser('Writer2')).post('/moderation/precheck', { text: 'Pray for rain.' })).json().harm).toBeUndefined();
  });

  it('bundles a flood from one account into one queue item, decided at once', async () => {
    await as(admin).patch('/admin/harm-settings', { flood_per_day: 2 });
    const troll = await createUser('Troll');
    const ids: string[] = [];
    for (const who of ['him', 'her', 'them', 'my boss', 'my neighbor']) ids.push((await post(troll, `I pray ${who} dies.`)).json().post.id);
    // The first two are reviewed one by one and stay up; the rest are held and share one item.
    expect((await status(ids[0]!)).moderation_status).toBe('visible');
    expect((await status(ids[3]!)).moderation_status).toBe('hidden_pending_review');
    const { rows } = await db.query(`select reason from public.moderation_items where user_id = $1 and source = 'harm' order by created_at`, [troll]);
    expect(rows.map((r) => r.reason.startsWith('Flood'))).toEqual([false, false, true]);
    const floods = (await as(moderator).get('/moderation/harm-floods')).json().floods;
    expect(floods.find((f: { user_id: string }) => f.user_id === troll)).toMatchObject({ items: 3 });
    expect((await as(moderator).post(`/moderation/harm-floods/${troll}`, { action: 'remove' })).json()).toEqual({ items: 3 });
    expect((await status(ids[4]!)).moderation_status).toBe('removed');
    expect((await status(ids[0]!)).moderation_status).toBe('visible');
    await as(admin).patch('/admin/harm-settings', { flood_per_day: 5 });
  });
});
