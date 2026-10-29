import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as ceaseless from '../src/modules/radio/ceaseless.js';
import * as operatorConsole from '../src/modules/radio/console.js';
import * as radio from '../src/modules/radio/index.js';
import * as receipts from '../src/modules/radio/receipts.js';
import * as tokens from '../src/modules/tokens/index.js';
import { app, as, createUser, db, newRequest, STATION_KEY } from './helpers.js';

const stationDefaults = await radio.stationSettings(db);
const defaults = await ceaseless.settings(db);
const consoleDefaults = await operatorConsole.settings(db);
const fundingDefault = (await tokens.settings(db)).radio_funding;
const claim = () => app.inject({ method: 'POST', url: '/station/claim-batch', headers: { 'x-station-key': STATION_KEY }, payload: { max: 50 } });
const later = (minutes: number) => new Date(Date.now() + 2 * 86_400_000 + minutes * 60_000);
const row = async (id: string) =>
  (await db.query<{ kind: string; cost: number; user_id: string; post_id: string; status: string }>('select kind, cost, user_id, post_id, status from public.radio_prayers where id = $1', [id])).rows[0];

let admin: string;
let member: string;
let other: string;
beforeAll(async () => {
  admin = await createUser('Ceaseless Admin');
  await grantRole(db, admin, 'admin', null);
  member = await createUser('Ceaseless Member');
  other = await createUser('Ceaseless Other');
  await as(admin).patch('/admin/radio-settings', { transmitter: 'station' });
  await tokens.updateSettings(db, { radio_funding: 'free' });
  // Earlier files may leave prayers waiting; the rotation only runs when nothing is.
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test cleanup' where status in ('queued', 'sending')`);
  await db.query('update public.posts set keep_on_air = false where keep_on_air');
  await db.query(`delete from public.radio_prayers where kind = 'ceaseless'`);
});
afterAll(async () => {
  await ceaseless.update(db, defaults);
  await operatorConsole.setEnabled(db, consoleDefaults.enabled);
  await radio.updateStationSettings(db, stationDefaults);
  await tokens.updateSettings(db, { radio_funding: fundingDefault });
  await db.end();
});

describe('prayer without ceasing', () => {
  let first: { id: string };
  let second: { id: string };

  it('is off by default: no "keep on the air", nothing re-sent, admin-only settings', async () => {
    expect(defaults).toEqual({ enabled: false, gapMinutes: 30 });
    first = await newRequest(member, 'Please pray for the river town after the flood.');
    expect((await as(member).put(`/posts/${first.id}/keep-on-air`, { on: true })).statusCode).toBe(400);
    expect((await as(member).get('/features')).json().features.keepOnAir).toBe(false);
    expect(await ceaseless.queueDue(db, later(0))).toBeNull();
    expect((await as(member).patch('/admin/radio-ceaseless', { enabled: true })).statusCode).toBe(403);
  });

  it('lets only the author keep a request on the air, and shows that only to them', async () => {
    expect((await as(admin).patch('/admin/radio-ceaseless', { enabled: true, gapMinutes: 30 })).json()).toEqual({ enabled: true, gapMinutes: 30 });
    expect((await as(admin).patch('/admin/radio-ceaseless', { gapMinutes: 1 })).statusCode).toBe(400);
    expect((await as(member).get('/features')).json().features.keepOnAir).toBe(true);
    expect((await as(other).put(`/posts/${first.id}/keep-on-air`, { on: true })).statusCode).toBe(404);
    expect((await as(member).put(`/posts/${first.id}/keep-on-air`, { on: true })).json()).toEqual({ keepOnAir: true });
    expect((await as(member).get(`/posts/${first.id}`)).json().post.keepOnAir).toBe(true);
    expect((await as(other).get(`/posts/${first.id}`)).json().post.keepOnAir).toBeUndefined();
    const sensitive = await newRequest(member, 'Please pray for something private.', { isSensitive: true });
    expect((await as(member).put(`/posts/${sensitive.id}/keep-on-air`, { on: true })).statusCode).toBe(409);
  });

  it('re-sends a kept request, free, only when nothing waits and the air has been quiet long enough', async () => {
    const id = (await ceaseless.queueDue(db, later(0)))!;
    expect(await row(id)).toMatchObject({ kind: 'ceaseless', cost: 0, user_id: member, post_id: first.id, status: 'queued' });
    // Something is waiting: no second one.
    expect(await ceaseless.queueDue(db, later(0))).toBeNull();
    // The station picks it up like any radio prayer.
    const batch = (await claim()).json().radioPrayers as { id: string; text: string }[];
    expect(batch.find((b) => b.id === id)?.text).toBe('Please pray for the river town after the flood.');
    await db.query(`update public.radio_prayers set status = 'transmitted', transmitted_at = $2 where id = $1`, [id, later(0)]);
    // Its author isn't told each time it goes out again.
    await radio.updateStationSettings(db, { radio_receipts_enabled: true });
    try {
      await receipts.onAir(db, id);
    } finally {
      await radio.updateStationSettings(db, { radio_receipts_enabled: stationDefaults.radio_receipts_enabled });
    }
    const notes = (await as(member).get('/me/notifications')).json().notifications as { kind: string; data: { radioPrayerId?: string } }[];
    expect(notes.filter((n) => n.data.radioPrayerId === id)).toEqual([]);
    // Too soon after the last transmission.
    expect(await ceaseless.queueDue(db, later(10))).toBeNull();
    // A request never re-sent goes before one sent before.
    second = await newRequest(member, 'Please pray for the night shift at the mill.');
    await as(member).put(`/posts/${second.id}/keep-on-air`, { on: true });
    const next = (await ceaseless.queueDue(db, later(31)))!;
    expect((await row(next))!.post_id).toBe(second.id);
    // A member's own prayer queued after it still goes out first.
    const own = await newRequest(other, 'Please pray for the bus drivers this winter.');
    expect((await as(other).post(`/posts/${own.id}/radio`, { idempotencyKey: `ceaseless-own-${own.id}` })).statusCode).toBe(201);
    const order = ((await claim()).json().radioPrayers as { id: string; text: string }[]).map((b) => b.text);
    expect(order[0]).toBe('Please pray for the bus drivers this winter.');
  });

  it('shows the rotation on the operator console, drops answered requests, and switching off clears what waits', async () => {
    await operatorConsole.setEnabled(db, true);
    expect((await as(admin).get('/radio/console')).json().ceaseless).toMatchObject({ enabled: true, gapMinutes: 30, inRotation: 2, sentLastDay: 1 });
    await db.query(`update public.posts set state = 'answered', answered_at = now() where id = $1`, [first.id]);
    expect((await as(admin).get('/radio/console')).json().ceaseless.inRotation).toBe(1);
    // A community that hides radio takes its requests out of the rotation.
    const { rows: hidden } = await db.query<{ id: string; hidden_features: string[] }>(
      'select c.id, c.hidden_features from public.communities c join public.posts p on p.community_id = c.id where p.id = $1',
      [second.id],
    );
    await db.query(`update public.communities set hidden_features = array_append(hidden_features, 'radio') where id = $1`, [hidden[0]!.id]);
    try {
      expect((await as(admin).get('/radio/console')).json().ceaseless.inRotation).toBe(0);
    } finally {
      await db.query('update public.communities set hidden_features = $2 where id = $1', [hidden[0]!.id, hidden[0]!.hidden_features]);
    }
    await as(admin).patch('/admin/radio-ceaseless', { enabled: false });
    const { rows } = await db.query(`select 1 from public.radio_prayers where kind = 'ceaseless' and status = 'queued'`);
    expect(rows).toHaveLength(0);
    expect((await as(admin).get('/radio/console')).json().ceaseless).toBeNull();
  });
});
