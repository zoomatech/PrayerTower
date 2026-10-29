// The moderator on-call rota (docs/HARMFUL_PRAYERS.md, "On-call rota").
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as harm from '../src/modules/harm/index.js';
import * as oncall from '../src/modules/moderator-care/oncall.js';
import { as, createUser, db } from './helpers.js';

const harmDefaults = await harm.settings(db);
const defaults = await oncall.settings(db);
let mod: string;
let admin: string;
let member: string;

beforeAll(async () => {
  [mod, admin, member] = [await createUser('Deborah'), await createUser('Barak'), await createUser('Jael')];
  await grantRole(db, mod, 'moderator', null);
  await grantRole(db, admin, 'admin', null);
  await harm.updateSettings(db, { enabled: true });
});
afterAll(async () => {
  await harm.updateSettings(db, harmDefaults);
  await oncall.updateSettings(db, defaults);
  await db.query('delete from public.oncall_shifts where user_id = $1', [mod]);
  await db.end();
});

// Notices about this item (other test files' items may be waiting too).
let itemId = '00000000-0000-0000-0000-000000000000';
const notices = async (userId: string, kind: string) =>
  (
    await db.query<{ title: string; body: string }>(
      `select title, body from public.notifications where user_id = $1 and kind = $2 and data->'itemIds' ? $3`,
      [userId, kind, itemId],
    )
  ).rows;

describe('on-call rota', () => {
  it('is off by default and only admins set it up', async () => {
    expect(defaults).toMatchObject({ enabled: false, max_wait_minutes: 60, remind_at_percent: 50 });
    expect((await as(mod).patch('/admin/oncall', { enabled: true })).statusCode).toBe(403);
    expect((await as(mod).post('/moderation/oncall/notes', { body: 'hi' })).statusCode).toBe(403);
    expect((await as(admin).patch('/admin/oncall', { timezone: 'Mars/Olympus' })).statusCode).toBe(400);
    expect((await as(admin).patch('/admin/oncall', { escalate_to: member })).statusCode).toBe(400);
    expect((await as(admin).post('/admin/oncall/shifts', { userId: member, weekday: 1, startMinute: 0, endMinute: 60 })).statusCode).toBe(400);
    expect((await as(admin).post('/admin/oncall/shifts', { userId: mod, weekday: 1, startMinute: 600, endMinute: 540 })).statusCode).toBe(400);
  });

  it('reminds whoever is on call, then escalates to the named admin, once each', async () => {
    const settings = (await as(admin).patch('/admin/oncall', { enabled: true, max_wait_minutes: 30, timezone: 'UTC', escalate_to: admin })).json().settings;
    expect(settings).toMatchObject({ enabled: true, max_wait_minutes: 30, escalate_to: admin });
    // On call all week, so "now" is always covered.
    for (let weekday = 0; weekday < 7; weekday++) {
      expect((await as(admin).post('/admin/oncall/shifts', { userId: mod, weekday, startMinute: 0, endMinute: 1440 })).statusCode).toBe(200);
    }
    const status = (await as(mod).get('/moderation/oncall')).json();
    expect(status.status.onCall.map((o: { user_id: string }) => o.user_id)).toContain(mod);

    const post = (await as(member).post('/posts', { postType: 'prayer_request', body: "I'm going to hurt him for this." })).json().post;
    expect((await db.query('select moderation_status from public.posts where id = $1', [post.id])).rows[0].moderation_status).toBe('hidden_pending_review');
    itemId = (await db.query(`select id from public.moderation_items where target_id = $1 and source = 'harm'`, [post.id])).rows[0].id;

    // Not yet halfway: nothing.
    await oncall.check(db, new Date(Date.now() + 5 * 60_000));
    expect(await notices(mod, 'oncall_reminder')).toHaveLength(0);
    // Halfway (15 of 30 minutes): the moderator on call is reminded, without the post's words.
    await oncall.check(db, new Date(Date.now() + 16 * 60_000));
    const reminders = await notices(mod, 'oncall_reminder');
    expect(reminders).toHaveLength(1);
    expect(reminders[0]!.body).not.toContain('hurt');
    expect(await notices(admin, 'oncall_escalation')).toHaveLength(0);
    // Past the limit: the named admin hears, once.
    await oncall.check(db, new Date(Date.now() + 31 * 60_000));
    await oncall.check(db, new Date(Date.now() + 40 * 60_000));
    expect(await notices(admin, 'oncall_escalation')).toHaveLength(1);
    expect(await notices(mod, 'oncall_reminder')).toHaveLength(1);
    const { rows } = await db.query('select oncall_reminded_at, oncall_escalated_at from public.moderation_items where target_id = $1 and source = $2', [post.id, 'harm']);
    expect(rows[0].oncall_reminded_at).not.toBeNull();
    expect(rows[0].oncall_escalated_at).not.toBeNull();
  });

  it('lets a shift leave notes for the next one', async () => {
    expect((await as(mod).post('/moderation/oncall/notes', { body: 'Two threats from one new account tonight; watch for more.' })).statusCode).toBe(200);
    const status = (await as(mod).get('/moderation/oncall')).json().status;
    expect(status.notes[0]).toMatchObject({ author_name: 'Deborah', body: 'Two threats from one new account tonight; watch for more.' });
    expect(status.waiting).toBeGreaterThan(0);
    const shift = (await as(admin).get('/admin/oncall')).json().shifts.find((s: { user_id: string }) => s.user_id === mod);
    expect((await as(admin).delete(`/admin/oncall/shifts/${shift.id}`)).statusCode).toBe(200);
    expect((await as(admin).delete(`/admin/oncall/shifts/${shift.id}`)).statusCode).toBe(404);
  });

  it('does nothing while switched off', async () => {
    await oncall.updateSettings(db, { enabled: false });
    expect(await oncall.check(db, new Date(Date.now() + 1000 * 60_000))).toEqual({ reminded: 0, escalated: 0 });
  });
});
