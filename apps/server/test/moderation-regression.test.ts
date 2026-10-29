// Regression pass: every moderation switch on at once, in both editions (Prayer Tower and
// Open Circle). Each feature has its own tests; this checks they still work together.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as harm from '../src/modules/harm/index.js';
import * as care from '../src/modules/moderator-care/index.js';
import * as oncall from '../src/modules/moderator-care/oncall.js';
import { as, createUser, db } from './helpers.js';

const RELIGIOUS = /\b(pray\w*|god|lord|jesus|church|pastors?|priestly|scripture|psalms?|romans|blessed)\b/i;
const defaults = { harm: await harm.settings(db), care: await care.settings(db), oncall: await oncall.settings(db) };
const kindDefault = (await db.query<{ on: boolean }>('select kind_cloud_enabled as on from public.notebook_settings')).rows[0]!.on;
let admin: string;
let mod: string;
let mod2: string;

beforeAll(async () => {
  [admin, mod, mod2] = [await createUser('Reg Admin'), await createUser('Reg Mod'), await createUser('Reg Mod Two')];
  await grantRole(db, admin, 'admin', null);
  await grantRole(db, mod, 'moderator', null);
  await grantRole(db, mod2, 'moderator', null);
  await as(admin).patch('/admin/communities/open-circle', { status: 'active' });
  await harm.updateSettings(db, { enabled: true, explain_held: true, flood_per_day: 5 });
  await care.updateSettings(db, { enabled: true, blur_hard: true, dashboard_enabled: true, weekly_report_enabled: true, restore_enabled: true });
  await oncall.updateSettings(db, { enabled: true, max_wait_minutes: 30, timezone: 'UTC', escalate_to: admin });
  await db.query('update public.notebook_settings set kind_cloud_enabled = true');
  for (let weekday = 0; weekday < 7; weekday++) await oncall.addShift(db, admin, { userId: mod, weekday, startMinute: 0, endMinute: 1440 });
});
afterAll(async () => {
  await harm.updateSettings(db, defaults.harm);
  await care.updateSettings(db, defaults.care);
  await oncall.updateSettings(db, defaults.oncall);
  await db.query('update public.notebook_settings set kind_cloud_enabled = $1', [kindDefault]);
  await db.query('delete from public.oncall_shifts where user_id = $1', [mod]);
  await db.query(`update public.communities set status = 'hidden', hidden_features = '{}' where slug = 'open-circle'`);
  await db.end();
});

const status = async (id: string) => (await db.query('select moderation_status, harm_category from public.posts where id = $1', [id])).rows[0];
const harmItem = async (targetId: string) =>
  (await as(mod).get(`/moderation/queue?targetId=${targetId}`)).json().items.find((i: { source: string }) => i.source === 'harm');

describe.each([
  { edition: 'Prayer Tower', slug: null },
  { edition: 'Open Circle', slug: 'open-circle' },
])('every moderation switch on: $edition', ({ slug }) => {
  const member = async (name: string) => {
    const id = await createUser(name);
    if (slug) await as(id).post('/me/community', { slug });
    return id;
  };
  const post = (id: string, body: string) => as(id).post('/posts', { postType: 'prayer_request', body });
  const secular = (text: string) => (slug ? expect(text).not.toMatch(RELIGIOUS) : undefined);

  it('leaves grief and illness alone, with the kind cloud quiet', async () => {
    const m = await member('Reg Grieving');
    for (const body of ['My husband died last week. I wish he had not suffered so long.', 'Kill the cancer cells. Hope the chemo destroys every tumor.']) {
      const pre = (await as(m).post('/moderation/precheck', { text: body })).json();
      expect(pre.harm).toBeUndefined();
      const res = await post(m, body);
      expect(res.statusCode).toBe(201);
      expect(await status(res.json().post.id)).toEqual({ moderation_status: 'visible', harm_category: null });
    }
  });

  it('holds a threat, blurs it, hands it off, takes an explanation, and restores it with a log and a notice', async () => {
    const m = await member('Reg Furious');
    const pre = (await as(m).post('/moderation/precheck', { text: "I'm going to hurt him." })).json();
    expect(pre.harm).toMatchObject({ category: 'threat', action: 'hold' });
    expect(pre.cloud.level).not.toBe('ok');
    secular(`${pre.harm.title} ${pre.harm.message}`);

    const res = await post(m, "I'm going to hurt him for what he did.");
    const id = res.json().post.id;
    expect(await status(id)).toEqual({ moderation_status: 'hidden_pending_review', harm_category: 'threat' });
    const item = await harmItem(id);
    expect(item).toMatchObject({ hard: true, auto_hidden: true });

    const held = (await db.query(`select title, body, data from public.notifications where user_id = $1 and kind = 'held_for_review'`, [m])).rows[0];
    expect(held.data).toMatchObject({ itemId: item.id, explainable: true });
    secular(`${held.title} ${held.body}`);
    expect((await as(m).post(`/moderation/items/${item.id}/appeal`, { message: 'I was angry. I will not hurt anyone.' })).statusCode).toBeLessThan(300);

    const handed = await as(mod).post(`/moderation/items/${item.id}/handoff`, { toUserId: mod2, note: 'Second opinion?' });
    expect(handed.statusCode, handed.body).toBe(200);
    const theirs = (await as(mod2).get(`/moderation/queue?targetId=${id}`)).json().items.find((i: { id: string }) => i.id === item.id);
    expect(theirs).toMatchObject({ handoff_from_name: 'Reg Mod', author_note: 'I was angry. I will not hurt anyone.' });

    // The rota reminds the moderator on call, then escalates to the admin.
    await oncall.check(db, new Date(Date.now() + 16 * 60_000));
    await oncall.check(db, new Date(Date.now() + 31 * 60_000));
    const notified = async (userId: string, kind: string) =>
      (await db.query(`select 1 from public.notifications where user_id = $1 and kind = $2 and data->'itemIds' ? $3`, [userId, kind, item.id])).rowCount;
    expect(await notified(mod, 'oncall_reminder')).toBe(1);
    expect(await notified(admin, 'oncall_escalation')).toBe(1);

    expect((await as(mod2).post(`/moderation/items/${item.id}/decision`, { action: 'dismiss' })).statusCode).toBe(200);
    expect(await status(id)).toEqual({ moderation_status: 'visible', harm_category: null });
    const actions = (await db.query('select action from public.moderation_actions where moderation_item_id = $1 order by created_at', [item.id])).rows;
    expect(actions.map((a) => a.action)).toEqual(['dismiss', 'restore']);
    const back = (await db.query(`select title, body from public.notifications where user_id = $1 and kind = 'post_restored'`, [m])).rows[0];
    expect(back.title).toMatch(/is back up/);
    secular(`${back.title} ${back.body}`);
  });

  it('keeps an abuse disclosure up with hotlines, and a crisis post up with crisis support', async () => {
    const m = await member('Reg Hurting');
    const abuse = (await post(m, 'My husband hits me and I am scared to go home.')).json();
    expect(await status(abuse.post.id)).toMatchObject({ moderation_status: 'visible' });
    expect(abuse.harm.resources.map((r: { url: string }) => r.url)).toContain('tel:18007997233');
    secular(`${abuse.harm.title} ${abuse.harm.message}`);

    const crisis = (await post(m, 'I want to kill myself tonight.')).json();
    expect(crisis.post.crisis).toBe(true);
    expect((await db.query('select moderation_status from public.posts where id = $1', [crisis.post.id])).rows[0].moderation_status).toBe('visible');
    const queue = (await as(mod).get(`/moderation/queue?targetId=${crisis.post.id}`)).json().items;
    expect(queue.some((i: { source: string }) => i.source === 'crisis')).toBe(true);
  });

  it('refuses only pure junk, and bundles a flood into one item', async () => {
    const m = await member('Reg Flooder');
    expect((await post(m, 'fuck shit fuck shit fuck')).statusCode).toBe(422);
    for (let i = 0; i < 7; i++) await post(m, `I curse my neighbor ${i}, may he rot ${i}.`);
    const floods = (await as(mod).get('/moderation/harm-floods')).json().floods;
    expect(floods.find((f: { user_id: string }) => f.user_id === m)?.items).toBeGreaterThan(0);
    expect((await as(mod).post(`/moderation/harm-floods/${m}`, { action: 'remove' })).statusCode).toBe(200);
  });

  it('shows the dashboard and the rota status', async () => {
    const dash = (await as(admin).get('/admin/moderation-dashboard?days=7')).json().dashboard;
    expect(dash.queue).toBeInstanceOf(Array);
    expect(dash.handoffs).toBeGreaterThan(0);
    const rota = (await as(mod).get('/moderation/oncall')).json().status;
    expect(rota.onCall.map((o: { user_id: string }) => o.user_id)).toContain(mod);
  });
});
