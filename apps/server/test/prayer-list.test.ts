// My prayer list: off by default, private to the member, with gentle reminders that
// skip anyone already prayed for since the last one.
import { afterAll, describe, expect, it } from 'vitest';
import { firstReminder } from '../src/modules/prayer-list/index.js';
import { as, createUser, db, drainJobs } from './helpers.js';

afterAll(async () => {
  await db.query('update public.notebook_settings set prayer_list_enabled = false');
  await db.end();
});

const remindNow = () => db.query(`update public.prayer_list_items set next_reminder_at = now() - interval '1 minute' where remind <> 'off'`);
const run = async () => {
  await db.query(`select graphile_worker.add_job('prayer_list_send_due_reminders', '{}')`);
  await drainJobs();
};
const reminders = async (userId: string) =>
  (await db.query(`select body from public.notifications where user_id = $1 and kind = 'prayer_list_reminder'`, [userId])).rows.map((r) => r.body);

describe('My prayer list', () => {
  it('keeps a private list and reminds gently', async () => {
    const me = await createUser('List Keeper');
    const other = await createUser('List Other');
    expect((await as(me).get('/me/prayer-list')).json()).toEqual({ enabled: false });
    expect((await as(me).post('/me/prayer-list', { name: 'Grandma' })).statusCode).toBe(403);

    await db.query('update public.notebook_settings set prayer_list_enabled = true');
    const added = (await as(me).post('/me/prayer-list', { name: 'Grandma', note: 'Hip surgery', remind: 'daily', hour: 9, tzOffsetMinutes: 300 })).json();
    expect(added.items).toHaveLength(1);
    const item = added.items[0];
    expect(item).toMatchObject({ name: 'Grandma', remind: 'daily', prayedCount: 0 });
    expect((await as(other).get('/me/prayer-list')).json().items).toEqual([]);
    expect((await as(other).post(`/me/prayer-list/${item.id}/prayed`)).statusCode).toBe(404);

    await remindNow();
    await run();
    expect(await reminders(me)).toEqual(['Did you remember to pray for Grandma today?']);

    // Prayed since: the next reminder is skipped.
    expect((await as(me).post(`/me/prayer-list/${item.id}/prayed`)).json().items[0].prayedCount).toBe(1);
    await remindNow();
    await run();
    expect(await reminders(me)).toHaveLength(1);

    expect((await as(me).patch(`/me/prayer-list/${item.id}`, { remind: 'off' })).json().items[0]).toMatchObject({ remind: 'off', nextReminderAt: null });
    expect((await as(me).delete(`/me/prayer-list/${item.id}`)).json().items).toEqual([]);
  });

  it('schedules the first reminder at the chosen hour in the member\'s time', () => {
    // 13:00 UTC = 08:00 at UTC-5 (offset 300): 9:00 local is 14:00 UTC the same day.
    const now = new Date('2026-11-02T13:00:00Z');
    expect(firstReminder(9, 300, now).toISOString()).toBe('2026-11-03T14:00:00.000Z');
    expect(firstReminder(20, 300, now).toISOString()).toBe('2026-11-03T01:00:00.000Z');
  });
});
