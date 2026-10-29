import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as fairAir from '../src/modules/radio/fair-air.js';
import * as radio from '../src/modules/radio/index.js';
import * as tokens from '../src/modules/tokens/index.js';
import { app, as, createUser, db, newRequest, STATION_KEY } from './helpers.js';

const stationDefaults = await radio.stationSettings(db);
const tokenDefaults = await tokens.settings(db);
const defaults = await fairAir.settings(db);
const claim = async () => {
  const res = await app.inject({ method: 'POST', url: '/station/claim-batch', headers: { 'x-station-key': STATION_KEY }, payload: { max: 50 } });
  return res.statusCode === 200 ? (res.json().radioPrayers as { id: string; text: string }[]) : [];
};
const RUN = Math.random().toString(36).slice(2, 7);

let admin: string;
let member: string;
let poster: string;
beforeAll(async () => {
  admin = await createUser('Fair Admin');
  await grantRole(db, admin, 'admin', null);
  member = await createUser('Fair Member');
  poster = await createUser('Fair Poster');
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
  await as(admin).patch('/admin/radio-settings', { transmitter: 'station', order: 'oldest', batchMax: 50, amplifyRepeats: 3 });
  await tokens.updateSettings(db, { radio_funding: 'free' });
});
afterAll(async () => {
  await fairAir.update(db, defaults);
  await radio.updateStationSettings(db, stationDefaults);
  await tokens.updateSettings(db, tokenDefaults);
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
  await db.end();
});

describe('fair air', () => {
  it('is off by default and admin-only', async () => {
    expect(defaults).toEqual({ everyRequest: false, dailyCap: null });
    await newRequest(poster, `Pray for my sister's exams. ${RUN}`);
    expect(await fairAir.queueNew(db)).toBe(0);
    expect((await as(member).patch('/admin/radio-fair-air', { dailyCap: 2 })).statusCode).toBe(403);
  });

  it('sends every new request once, free, after the prayers members sent themselves', async () => {
    expect((await as(admin).patch('/admin/radio-fair-air', { everyRequest: true })).json()).toEqual({ everyRequest: true, dailyCap: null });
    await db.query(`update public.posts set created_at = now() - interval '2 days' where body not like $1`, [`%${RUN}%`]);
    const sensitive = await newRequest(poster, `Something private. ${RUN}`, { isSensitive: true });
    const n = await fairAir.queueNew(db);
    expect(n).toBe(1);
    expect(await fairAir.queueNew(db)).toBe(0);
    const { rows } = await db.query(`select kind, cost, user_id from public.radio_prayers where post_id in (select id from public.posts where body like $1)`, [`%${RUN}%`]);
    expect(rows).toEqual([{ kind: 'auto', cost: 0, user_id: poster }]);
    expect((await db.query('select 1 from public.radio_prayers where post_id = $1', [sensitive.id])).rows).toHaveLength(0);
    // A member's own send goes first.
    const own = await newRequest(poster, `Pray for the night nurses. ${RUN}`);
    await as(member).post(`/posts/${own.id}/radio`, { idempotencyKey: `fair-own-${RUN}` });
    const batch = await claim();
    expect(batch.map((b) => b.text)).toEqual([`Pray for the night nurses. ${RUN}`, `Pray for my sister's exams. ${RUN}`]);
  });

  it("tells the asker their own request went out, not that they sent a radio prayer", async () => {
    const receiptsDefault = (await radio.stationSettings(db)).radio_receipts_enabled;
    await radio.updateStationSettings(db, { radio_receipts_enabled: true });
    try {
      const post = await newRequest(poster, `Pray for the ferry crew tonight. ${RUN}`);
      expect(await fairAir.queueNew(db)).toBe(1);
      const sent = (await claim()).find((b) => b.text === `Pray for the ferry crew tonight. ${RUN}`)!;
      const res = await app.inject({ method: 'POST', url: `/station/radio-prayers/${sent.id}/result`, headers: { 'x-station-key': STATION_KEY }, payload: { ok: true, callSign: `K${RUN}` } });
      expect(res.statusCode).toBe(200);
      const notes = (await as(poster).get('/me/notifications')).json().notifications as { kind: string; title: string; data: { postId?: string } }[];
      expect(notes.find((n) => n.kind === 'radio_on_air' && n.data.postId === post.id)?.title).toBe('Your request went out on the air');
    } finally {
      await radio.updateStationSettings(db, { radio_receipts_enabled: receiptsDefault });
    }
  });

  it('caps radio sends per member a day, amplified ones counting each time they go out', async () => {
    expect((await as(admin).patch('/admin/radio-fair-air', { dailyCap: 4 })).json().dailyCap).toBe(4);
    const posts = await Promise.all([1, 2, 3].map((i) => newRequest(poster, `Cap test ${i}. ${RUN}`)));
    // One already today (the night nurses) + 3 amplified = 4.
    expect((await as(member).post(`/posts/${posts[0]!.id}/radio`, { idempotencyKey: `cap-a-${RUN}`, amplify: true })).statusCode).toBe(201);
    const refused = await as(member).post(`/posts/${posts[1]!.id}/radio`, { idempotencyKey: `cap-b-${RUN}` });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().message).toMatch(/up to 4 radio prayers a day/);
    // Another member is not affected; lifting the cap lets it through.
    expect((await as(poster).post(`/posts/${posts[1]!.id}/radio`, { idempotencyKey: `cap-c-${RUN}` })).statusCode).toBe(201);
    await as(admin).patch('/admin/radio-fair-air', { dailyCap: null });
    expect((await as(member).post(`/posts/${posts[2]!.id}/radio`, { idempotencyKey: `cap-d-${RUN}` })).statusCode).toBe(201);
  });

  it('switching off drops automatic sends still waiting', async () => {
    await newRequest(poster, `Pray for the road crew. ${RUN}`);
    expect(await fairAir.queueNew(db)).toBeGreaterThan(0);
    await as(admin).patch('/admin/radio-fair-air', { everyRequest: false });
    expect((await db.query(`select 1 from public.radio_prayers where kind = 'auto' and status = 'queued'`)).rows).toHaveLength(0);
  });
});
