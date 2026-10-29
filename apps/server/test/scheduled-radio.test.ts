import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as fairAir from '../src/modules/radio/fair-air.js';
import * as radio from '../src/modules/radio/index.js';
import * as schedules from '../src/modules/schedules/index.js';
import * as tokens from '../src/modules/tokens/index.js';
import { as, createUser, db, drainJobs, newRequest } from './helpers.js';

const stationDefaults = await radio.stationSettings(db);
const tokenDefaults = await tokens.settings(db);
const enabledDefault = await schedules.radioEnabled(db);
const soon = () => new Date(Date.now() + 10 * 60_000).toISOString();
const runNow = async (id: string) => {
  await db.query(`update public.scheduled_spends set next_run_at = now() - interval '1 second' where id = $1`, [id]);
  await db.query(`select graphile_worker.add_job('schedules_run_due', '{}')`);
  await drainJobs();
};

let admin: string;
let member: string;
let poster: string;
beforeAll(async () => {
  admin = await createUser('Sched Radio Admin');
  await grantRole(db, admin, 'admin', null);
  member = await createUser('Sched Radio Dom');
  poster = await createUser('Sched Radio Poster');
  await as(admin).patch('/admin/radio-settings', { transmitter: 'station' });
  await tokens.updateSettings(db, { radio_funding: 'free' });
});
afterAll(async () => {
  await schedules.setRadioEnabled(db, enabledDefault);
  await radio.updateStationSettings(db, stationDefaults);
  await tokens.updateSettings(db, { radio_funding: tokenDefaults.radio_funding, amplify_paid_cost: tokenDefaults.amplify_paid_cost });
  await db.end();
});

describe('scheduled radio sends', () => {
  it('is off by default and admin-only', async () => {
    expect(enabledDefault).toBe(false);
    const post = await newRequest(poster, 'Pray for the team on Sunday.');
    expect((await as(member).post(`/posts/${post.id}/scheduled-spends`, { amount: 1, runAt: soon(), action: 'radio' })).statusCode).toBe(400);
    expect((await as(member).get('/features')).json().features.scheduledRadio).toBe(false);
    expect((await as(member).patch('/admin/scheduled-radio', { enabled: true })).statusCode).toBe(403);
  });

  it('sends the request by radio at the set time', async () => {
    expect((await as(admin).patch('/admin/scheduled-radio', { enabled: true })).json()).toEqual({ enabled: true });
    expect((await as(member).get('/features')).json().features.scheduledRadio).toBe(true);
    const post = await newRequest(poster, 'Pray for the game at kickoff.');
    const res = await as(member).post(`/posts/${post.id}/scheduled-spends`, { amount: 2500, runAt: soon(), action: 'radio' });
    expect(res.statusCode).toBe(201);
    const s = res.json().schedule;
    expect(s).toMatchObject({ action: 'radio', amount: 1 });
    await runNow(s.id);
    const { rows } = await db.query('select status, repeats, kind from public.radio_prayers where user_id = $1 and post_id = $2', [member, post.id]);
    expect(rows).toEqual([{ status: 'queued', repeats: 1, kind: 'prayer' }]);
    const [mine] = (await as(member).get('/me/scheduled-spends')).json().schedules;
    expect(mine).toMatchObject({ action: 'radio', status: 'done', runs: 1 });
  });

  it('skips one week, and keeps the schedule, when the member is over the daily radio cap', async () => {
    const capDefault = (await fairAir.settings(db)).dailyCap;
    const capped = await createUser('Sched Radio Capped');
    await fairAir.update(db, { dailyCap: 1 });
    try {
      const first = await newRequest(poster, 'Pray for the crossing guards this morning.');
      expect((await as(capped).post(`/posts/${first.id}/radio`, { idempotencyKey: `sched-cap-${capped}` })).statusCode).toBe(201);
      const post = await newRequest(poster, 'Pray for the night nurses on the ward.');
      const s = (await as(capped).post(`/posts/${post.id}/scheduled-spends`, { amount: 1, runAt: soon(), action: 'radio', repeatWeeks: 3 })).json().schedule;
      await runNow(s.id);
      const { rows } = await db.query<{ status: string; runs: number; next_run_at: Date }>('select status, runs, next_run_at from public.scheduled_spends where id = $1', [s.id]);
      expect(rows[0]).toMatchObject({ status: 'active', runs: 1 });
      expect(rows[0]!.next_run_at.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
      expect((await db.query('select 1 from public.radio_prayers where user_id = $1 and post_id = $2', [capped, post.id])).rows).toHaveLength(0);
      const notes = (await as(capped).get('/me/notifications')).json().notifications as { kind: string; title: string; data: { scheduleId?: string } }[];
      expect(notes.find((n) => n.data.scheduleId === s.id)?.title).toBe("This week's scheduled radio send was skipped");
    } finally {
      await fairAir.update(db, { dailyCap: capDefault });
    }
  });

  it('stops and tells the member when the radio refuses it when it is time', async () => {
    await tokens.updateSettings(db, { radio_funding: 'tokens', amplify_paid_cost: null });
    const post = await newRequest(poster, 'Pray for the drive home after the game.');
    const s = (await as(member).post(`/posts/${post.id}/scheduled-spends`, { amount: 1, runAt: soon(), action: 'amplify' })).json().schedule;
    await runNow(s.id);
    const { rows } = await db.query('select status, error from public.scheduled_spends where id = $1', [s.id]);
    expect(rows[0]).toMatchObject({ status: 'failed', error: expect.stringMatching(/^Amplify is only available/) });
    const notes = (await as(member).get('/me/notifications')).json().notifications;
    expect(notes.some((n: { kind: string; data: { scheduleId?: string } }) => n.kind === 'scheduled_spend' && n.data.scheduleId === s.id)).toBe(true);
    // Switched off after it was set: it stops too.
    await tokens.updateSettings(db, { radio_funding: 'free' });
    const later = (await as(member).post(`/posts/${post.id}/scheduled-spends`, { amount: 1, runAt: soon(), action: 'radio' })).json().schedule;
    await as(admin).patch('/admin/scheduled-radio', { enabled: false });
    await runNow(later.id);
    expect((await db.query('select status, error from public.scheduled_spends where id = $1', [later.id])).rows[0]).toEqual({ status: 'failed', error: 'Scheduled radio sends were switched off.' });
  });
});
