// Looking after moderators, and members explaining a held post (docs/HARMFUL_PRAYERS.md).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as harm from '../src/modules/harm/index.js';
import * as care from '../src/modules/moderator-care/index.js';
import { as, createUser, db } from './helpers.js';
import { buildTaskList } from '../src/tasks.js';
import { config } from './helpers.js';

const harmDefaults = await harm.settings(db);
const careDefaults = await care.settings(db);
let mod1: string;
let mod2: string;
let admin: string;

beforeAll(async () => {
  [mod1, mod2, admin] = [await createUser('Ruth'), await createUser('Boaz'), await createUser('Naomi')];
  await grantRole(db, mod1, 'moderator', null);
  await grantRole(db, mod2, 'moderator', null);
  await grantRole(db, admin, 'admin', null);
  await harm.updateSettings(db, { enabled: true });
});
afterAll(async () => {
  await harm.updateSettings(db, harmDefaults);
  await care.updateSettings(db, careDefaults);
  await db.end();
});

const heldPost = async (who: string, body: string) => {
  const post = (await as(who).post('/posts', { postType: 'prayer_request', body })).json().post;
  const item = (await as(admin).get(`/moderation/queue?targetId=${post.id}`)).json().items.find((i: { source: string }) => i.source === 'harm');
  return { post, item };
};

describe('moderator care', () => {
  it('is off by default, then marks hard items and lets a moderator hand one on', async () => {
    expect(careDefaults.enabled).toBe(false);
    const { item } = await heldPost(await createUser('Angry'), "I'm going to hurt him.");
    expect(item.hard).toBe(true);
    expect((await as(mod1).post(`/moderation/items/${item.id}/handoff`, { toUserId: mod2 })).statusCode).toBe(403);

    expect((await as(mod1).patch('/admin/moderator-care-settings', { enabled: true })).statusCode).toBe(403);
    expect((await as(admin).patch('/admin/moderator-care-settings', { enabled: true })).json().settings).toMatchObject({ enabled: true, blur_hard: true, break_after_minutes: 20 });
    const cared = (await as(mod1).get('/moderation/care')).json();
    expect(cared.colleagues.map((c: { id: string }) => c.id)).toContain(mod2);

    expect((await as(mod1).post(`/moderation/items/${item.id}/handoff`, { toUserId: mod1 })).statusCode).toBe(400);
    expect((await as(mod1).post(`/moderation/items/${item.id}/handoff`, { toUserId: mod2, note: 'Second opinion, please.' })).statusCode).toBe(200);
    // It leaves the passer's queue and tops the receiver's, with who passed it and the note.
    const mine = (await as(mod1).get('/moderation/queue')).json().items;
    expect(mine.some((i: { id: string }) => i.id === item.id)).toBe(false);
    const theirs = (await as(mod2).get('/moderation/queue')).json().items;
    const first = theirs.findIndex((i: { id: string }) => i.id === item.id);
    expect(theirs[first]).toMatchObject({ handoff_from_name: 'Ruth', handoff_note: 'Second opinion, please.' });
    expect(theirs.slice(0, first).every((i: { source: string }) => i.source === 'crisis')).toBe(true);
    const { rows } = await db.query(`select body from public.notifications where user_id = $1 and kind = 'moderation_handoff'`, [mod2]);
    expect(rows).toHaveLength(1);
    expect(rows[0].body).not.toContain('hurt');
  });
});

describe('explaining a held post', () => {
  it('tells the member it is held, and carries their explanation to the moderator once', async () => {
    const member = await createUser('Venting');
    const { item } = await heldPost(member, 'I will kill my brother if he takes the house.');
    const { rows } = await db.query(`select data from public.notifications where user_id = $1 and kind = 'held_for_review'`, [member]);
    expect(rows[0].data).toEqual({ itemId: item.id, explainable: true });

    expect((await as(await createUser('Stranger')).post(`/moderation/items/${item.id}/appeal`, { message: 'Not mine' })).statusCode).toBe(404);
    expect((await as(member).post(`/moderation/items/${item.id}/appeal`, { message: 'Just a figure of speech; we are fighting over a will.' })).statusCode).toBe(201);
    expect((await as(member).post(`/moderation/items/${item.id}/appeal`, { message: 'Again' })).statusCode).toBe(409);
    const queued = (await as(mod1).get(`/moderation/queue?targetId=${item.target_id}`)).json().items[0];
    expect(queued.author_note).toBe('Just a figure of speech; we are fighting over a will.');
    // Keeping it shows it again, as with any held item.
    await as(mod1).post(`/moderation/items/${item.id}/decision`, { action: 'dismiss' });
    expect((await db.query('select moderation_status, harm_category from public.posts where id = $1', [item.target_id])).rows[0]).toEqual({ moderation_status: 'visible', harm_category: null });
  });

  it('can be switched off', async () => {
    await harm.updateSettings(db, { explain_held: false });
    const member = await createUser('Quiet');
    const { item } = await heldPost(member, "I'm going to hurt them.");
    expect((await as(member).post(`/moderation/items/${item.id}/appeal`, { message: 'Please' })).statusCode).toBe(400);
    await harm.updateSettings(db, { explain_held: true });
  });
});

describe('moderation dashboard and weekly report', () => {
  it('is off by default, then shows the queue, speed, false alarms and floods', async () => {
    await care.updateSettings(db, { dashboard_enabled: false });
    expect((await as(admin).get('/admin/moderation-dashboard')).statusCode).toBe(403);
    await as(admin).patch('/admin/moderator-care-settings', { dashboard_enabled: true });
    expect((await as(mod1).get('/admin/moderation-dashboard')).statusCode).toBe(403);

    // One false alarm (dismissed) and one real one (removed).
    const wish = await heldPost(await createUser('Hurt'), 'I pray he dies.');
    await as(mod1).post(`/moderation/items/${wish.item.id}/decision`, { action: 'dismiss' });
    const wish2 = await heldPost(await createUser('Cruel'), 'I hope my neighbor dies.');
    await as(mod1).post(`/moderation/items/${wish2.item.id}/decision`, { action: 'remove', rule: 'harm' });

    const { dashboard } = (await as(admin).get('/admin/moderation-dashboard?days=1')).json();
    expect(dashboard.queue.find((r: { source: string }) => r.source === 'harm')).toMatchObject({ pending: expect.any(Number), oldest_minutes: expect.any(Number) });
    expect(dashboard.speed.find((r: { source: string }) => r.source === 'harm').decided).toBeGreaterThanOrEqual(2);
    const wishes = dashboard.falseAlarms.find((r: { category: string }) => r.category === 'harm_wish');
    expect(wishes.dismissed).toBeGreaterThanOrEqual(1);
    expect(wishes.rate).toBeGreaterThan(0);
    expect(dashboard.floods).toMatchObject({ floods: expect.any(Number), items: expect.any(Number) });
    expect(dashboard.handoffs).toBeGreaterThanOrEqual(1);
  });

  it('reports each word rule with how moderators decided, and flags rules mostly dismissed', async () => {
    const start = new Date(Date.now() - 86_400_000);
    for (let i = 0; i < 3; i++) {
      const { item } = await heldPost(await createUser(`Loose ${i}`), `I curse my neighbor number ${i}.`);
      await as(mod1).post(`/moderation/items/${item.id}/decision`, { action: 'dismiss' });
    }
    const report = await care.weeklyReport(db, start);
    const curse = report.rules.find((r) => r.rule === 'curse:0')!;
    expect(curse).toMatchObject({ dismissed: expect.any(Number), tooLoose: true });
    expect(curse.falseAlarmRate).toBeGreaterThanOrEqual(0.5);
    // Never the members' words.
    expect(JSON.stringify(report)).not.toContain('neighbor');
  });

  it('sends the Monday report to admins once a week, only while switched on', async () => {
    const run = () => buildTaskList(db, config).harm_weekly_report!({}, {} as never);
    const week = care.lastWeekStart().toISOString().slice(0, 10);
    await db.query('delete from public.harm_weekly_reports where week_start = $1', [week]);
    await care.updateSettings(db, { weekly_report_enabled: false });
    await run();
    expect((await db.query('select 1 from public.harm_weekly_reports where week_start = $1', [week])).rows).toHaveLength(0);
    await care.updateSettings(db, { weekly_report_enabled: true });
    await run();
    await run();
    expect((await db.query('select 1 from public.harm_weekly_reports where week_start = $1', [week])).rows).toHaveLength(1);
    const { rows } = await db.query(`select body from public.notifications where user_id = $1 and kind = 'harm_weekly_report'`, [admin]);
    expect(rows).toHaveLength(1);
    expect((await as(admin).get('/admin/moderation-dashboard')).json().reports[0].week_start).toBeDefined();
  });
});
