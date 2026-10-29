import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as radio from '../src/modules/radio/index.js';
import * as tokens from '../src/modules/tokens/index.js';
import { app, as, createUser, db, drainJobs, newRequest, STATION_KEY } from './helpers.js';

const tokenDefaults = await tokens.settings(db);
const stationDefaults = await radio.stationSettings(db);
const station = (path: string, body: object = {}, key = STATION_KEY) =>
  app.inject({ method: 'POST', url: path, headers: { 'x-station-key': key }, payload: body });

let admin: string;
beforeAll(async () => {
  admin = await createUser('Radio Admin');
  await grantRole(db, admin, 'admin', null);
  // Start from an empty queue so other tests' prayers don't interleave.
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
});
afterAll(async () => {
  await radio.updateStationSettings(db, stationDefaults);
  await tokens.updateSettings(db, tokenDefaults);
  await db.end();
});

describe('radio station', () => {
  it('hands queued prayers to the station only in station mode, free, with a valid key', async () => {
    expect(stationDefaults).toEqual({ radio_transmitter: 'log', radio_station_requires_free: true, radio_max_chars: 1000, radio_amplify_repeats: 3, radio_order: 'oldest' });
    expect((await station('/station/claim')).statusCode).toBe(409); // log mode
    const s = await as(admin).patch('/admin/radio-settings', { transmitter: 'station' });
    expect(s.json().settings.radio_transmitter).toBe('station');
    await tokens.updateSettings(db, { radio_funding: 'tokens' });
    const amateur = await station('/station/claim');
    expect(amateur.statusCode).toBe(409);
    expect(amateur.json().message).toMatch(/Amateur rules/);
    // So members can't pay for a prayer the station would never send.
    const payer = await createUser('Paying Sender');
    const paid = await newRequest(payer, 'Pray for my exams.');
    const refused = await as(payer).post(`/posts/${paid.id}/radio`, { idempotencyKey: 'st-paid' });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().message).toMatch(/Radio prayers are paused/);
    expect((await db.query('select 1 from public.radio_prayers where post_id = $1', [paid.id])).rowCount).toBe(0);
    await tokens.updateSettings(db, { radio_funding: 'free' });
    expect((await station('/station/claim', {}, 'wrong-key-wrong-key-wrong-key-00')).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/station/claim' })).statusCode).toBe(401);
    expect((await station('/station/claim')).statusCode).toBe(204); // empty queue
  });

  it('sends only the request text, records the call sign, and tells the poster', async () => {
    const poster = await createUser('Martha Poster');
    const sender = await createUser('Lazarus');
    const post = await newRequest(poster, 'Pray   for rain on the farms,\nLord.');
    expect((await as(sender).post(`/posts/${post.id}/radio`, { idempotencyKey: 'st-1' })).statusCode).toBe(201);
    await drainJobs(); // station mode: the job leaves it queued

    const claim = await station('/station/claim');
    expect(claim.statusCode).toBe(200);
    const { radioPrayer } = claim.json();
    expect(radioPrayer.text).toBe('Pray for rain on the farms, Lord.');
    expect(JSON.stringify(radioPrayer)).not.toMatch(/Martha|Lazarus/);
    expect((await station('/station/claim')).statusCode).toBe(204); // it's being sent

    expect((await station(`/station/radio-prayers/${radioPrayer.id}/result`, { ok: true, callSign: 'N0CALL', pieces: 1 })).statusCode).toBe(200);
    const [mine] = (await as(sender).get('/me/radio-prayers')).json().radioPrayers;
    expect(mine.status).toBe('transmitted');
    const { rows } = await db.query('select call_sign, pieces from public.radio_prayers where id = $1', [radioPrayer.id]);
    expect(rows[0]).toEqual({ call_sign: 'N0CALL', pieces: 1 });
    const notes = (await as(poster).get('/me/notifications')).json().notifications;
    expect(notes.some((n: { kind: string }) => n.kind === 'radio_prayer')).toBe(true);
    // Reporting twice is refused.
    expect((await station(`/station/radio-prayers/${radioPrayer.id}/result`, { ok: true, callSign: 'N0CALL' })).statusCode).toBe(400);
  });

  it('skips sensitive requests, re-offers stale claims, and records failures', async () => {
    const poster = await createUser('Poster');
    const sender = await createUser('Sender');
    const sensitive = await newRequest(poster, 'Graphic details.');
    const plain = await newRequest(poster, 'Pray for peace.');
    await as(sender).post(`/posts/${sensitive.id}/radio`, { idempotencyKey: 'st-2' });
    // Marked sensitive after it was queued (a request already sensitive is refused up front).
    await db.query('update public.posts set is_sensitive = true where id = $1', [sensitive.id]);
    const upfront = await newRequest(poster, 'More graphic details.', { isSensitive: true });
    expect((await as(sender).post(`/posts/${upfront.id}/radio`, { idempotencyKey: 'st-2b' })).statusCode).toBe(409);
    await as(sender).post(`/posts/${plain.id}/radio`, { idempotencyKey: 'st-3' });

    const first = (await station('/station/claim')).json().radioPrayer;
    expect(first.text).toBe('Pray for peace.');
    const { rows } = await db.query(
      `select r.status, r.error from public.radio_prayers r where r.post_id = $1`,
      [sensitive.id],
    );
    expect(rows[0]).toEqual({ status: 'failed', error: 'not sent: sensitive request' });

    await db.query(`update public.radio_prayers set claimed_at = now() - interval '20 minutes' where id = $1`, [first.id]);
    const again = (await station('/station/claim')).json().radioPrayer;
    expect(again.id).toBe(first.id);
    await station(`/station/radio-prayers/${again.id}/result`, { ok: false, callSign: 'N0CALL', error: 'transmit timed out' });
    const after = await db.query('select status, error from public.radio_prayers where id = $1', [again.id]);
    expect(after.rows[0]).toEqual({ status: 'failed', error: 'transmit timed out' });
  });

  it('amplifies: free only, sent several times, and the request becomes amplified', async () => {
    const poster = await createUser('Amplify Poster');
    const sender = await createUser('Amplify Sender');
    const post = await newRequest(poster, 'Pray for peace in our city.');
    await as(sender).post(`/posts/${post.id}/praying-now`);
    await tokens.updateSettings(db, { radio_funding: 'tokens' });
    const paid = await as(sender).post(`/posts/${post.id}/radio`, { idempotencyKey: 'amp-1', amplify: true });
    expect(paid.statusCode).toBe(409);
    expect(paid.json().message).toMatch(/only available while radio prayers are free/);
    await tokens.updateSettings(db, { radio_funding: 'free' });
    expect((await as(sender).get('/me/tokens')).json().priestly.amplifyRepeats).toBe(3);
    const res = await as(sender).post(`/posts/${post.id}/radio`, { idempotencyKey: 'amp-2', amplify: true });
    expect(res.json().radioPrayer).toMatchObject({ cost: 0, repeats: 3 });
    const claim = (await station('/station/claim')).json().radioPrayer;
    expect(claim).toMatchObject({ text: 'Pray for peace in our city.', repeats: 3 });
    await station(`/station/radio-prayers/${claim.id}/result`, { ok: true, callSign: 'N0CALL', pieces: 3 });
    const { rows } = await db.query('select state from public.posts where id = $1', [post.id]);
    expect(rows[0].state).toBe('amplified');
    // Prayer Cast lists what went out: the text and the call sign, never names.
    const cast = (await as(poster).get('/prayer-cast')).json();
    const entry = cast.cast.find((c: { id: string }) => c.id === claim.id);
    expect(entry).toMatchObject({ text: 'Pray for peace in our city.', repeats: 3, call_sign: 'N0CALL' });
    expect(JSON.stringify(entry)).not.toMatch(/Amplify (Poster|Sender)/);
    expect(cast.totals.sends).toBeGreaterThanOrEqual(3);
    // A request that mentioned self-harm never appears in the public log.
    const crisis = await newRequest(poster, 'Some nights I want to die.');
    const sent = (await as(sender).post(`/posts/${crisis.id}/radio`, { idempotencyKey: 'amp-3' })).statusCode;
    expect(sent).toBe(409); // waits for a moderator
    await db.query(
      `insert into public.radio_prayers (post_id, user_id, cost, idempotency_key, status, transmitted_at) values ($1, $2, 0, 'forced', 'transmitted', now())`,
      [crisis.id, sender],
    );
    expect((await as(poster).get('/prayer-cast')).json().cast.some((c: { post_id: string }) => c.post_id === crisis.id)).toBe(false);
  });

  it('by need: the most urgent request goes first, then the one with the fewest praying, then the oldest', async () => {
    await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
    await as(admin).patch('/admin/radio-settings', { transmitter: 'station' });
    await tokens.updateSettings(db, { radio_funding: 'free' });
    const poster = await createUser('Need Poster');
    const sender = await createUser('Need Sender');
    const friend = await createUser('Need Friend');
    const plain = await newRequest(poster, 'Pray for my garden.');
    const prayedFor = await newRequest(poster, 'Pray for my job search.');
    const lonely = await newRequest(poster, 'Pray for my move.');
    const urgent = await newRequest(poster, 'Pray for my surgery tomorrow.');
    await db.query('update public.posts set urgency = 3 where id = $1', [urgent.id]);
    await as(friend).post(`/posts/${prayedFor.id}/praying-now`, {});
    for (const [i, p] of [plain, prayedFor, lonely, urgent].entries()) {
      expect((await as(sender).post(`/posts/${p.id}/radio`, { idempotencyKey: `need-${i}` })).statusCode).toBe(201);
    }
    const order = async () => {
      const sent: string[] = [];
      for (let i = 0; i < 4; i++) {
        const c = (await station('/station/claim')).json().radioPrayer;
        sent.push(c.text);
        await station(`/station/radio-prayers/${c.id}/result`, { ok: true, callSign: 'N0CALL' });
      }
      return sent;
    };
    expect((await as(admin).patch('/admin/radio-settings', { order: 'need' })).json().settings.radio_order).toBe('need');
    expect(await order()).toEqual(['Pray for my surgery tomorrow.', 'Pray for my garden.', 'Pray for my move.', 'Pray for my job search.']);
  });
});
