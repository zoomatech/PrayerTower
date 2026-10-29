import { createHash } from 'node:crypto';
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

describe('listening page', () => {
  it('is a 404 until Admin → Radio turns it on, then serves the decoder', async () => {
    expect((await app.inject({ method: 'GET', url: '/listen' })).statusCode).toBe(404);
    expect((await as(admin).get('/radio/listen')).json()).toEqual({ enabled: false, receipts: false, prayingToo: false });
    expect((await as(admin).patch('/admin/radio-settings', { listenPage: true })).json().settings.listen_page_enabled).toBe(true);
    // The app's Listen screen follows the same switch.
    expect((await as(admin).get('/radio/listen')).json()).toEqual({ enabled: true, receipts: false, prayingToo: false });
    expect((await app.inject({ method: 'GET', url: '/radio/listen' })).statusCode).toBe(401);
    const page = await app.inject({ method: 'GET', url: '/listen' });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Start listening');
    expect(page.body).toContain('PTDecoder');
    await as(admin).patch('/admin/radio-settings', { listenPage: false });
    expect((await app.inject({ method: 'GET', url: '/listen' })).statusCode).toBe(404);
  });
});

describe('radio station', () => {
  it('hands queued prayers to the station only in station mode, free, with a valid key', async () => {
    expect(stationDefaults).toEqual({ radio_transmitter: 'log', radio_station_requires_free: true, radio_max_chars: 1000, radio_amplify_repeats: 3, radio_order: 'oldest', radio_batch_max: 1, listen_page_enabled: false, radio_receipts_enabled: false, on_air_page_enabled: false, radio_urgent_first: false });
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

  it('urgent first sends "Today" and "Right now" requests ahead of older ones, off by default', async () => {
    await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
    await as(admin).patch('/admin/radio-settings', { transmitter: 'station', order: 'oldest' });
    await tokens.updateSettings(db, { radio_funding: 'free' });
    const poster = await createUser('Urgent Poster');
    const sender = await createUser('Urgent Sender');
    const texts = ['Pray for my old roof.', 'Pray for my exam today.', 'Pray for my sister, right now.', 'Pray for my soon trip.'];
    for (const [i, text] of texts.entries()) {
      const p = await newRequest(poster, text);
      await db.query('update public.posts set urgency = $2 where id = $1', [p.id, [0, 2, 3, 1][i]]);
      expect((await as(sender).post(`/posts/${p.id}/radio`, { idempotencyKey: `urgent-${i}` })).statusCode).toBe(201);
    }
    const claim = async () => {
      const c = (await station('/station/claim')).json().radioPrayer;
      await station(`/station/radio-prayers/${c.id}/result`, { ok: true, callSign: 'N0CALL' });
      return c.text as string;
    };
    // Off: first in, first out.
    expect(await claim()).toBe('Pray for my old roof.');
    expect((await as(admin).patch('/admin/radio-settings', { urgentFirst: true })).json().settings.radio_urgent_first).toBe(true);
    // On: the two urgent ones (oldest first among them), then the rest.
    expect([await claim(), await claim(), await claim()]).toEqual(['Pray for my exam today.', 'Pray for my sister, right now.', 'Pray for my soon trip.']);
    await as(admin).patch('/admin/radio-settings', { urgentFirst: false });
  });

  it('burst mode hands out several prayers at once, never more than the admin allows', async () => {
    await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
    await as(admin).patch('/admin/radio-settings', { transmitter: 'station', order: 'oldest' });
    await tokens.updateSettings(db, { radio_funding: 'free' });
    const poster = await createUser('Burst Poster');
    const sender = await createUser('Burst Sender');
    for (let i = 0; i < 5; i++) {
      const p = await newRequest(poster, `Burst prayer number ${i}.`);
      await as(sender).post(`/posts/${p.id}/radio`, { idempotencyKey: `burst-${i}` });
    }
    // Off (1) by default: one at a time even when the station asks for more.
    const one = (await station('/station/claim-batch', { max: 10 })).json().radioPrayers;
    expect(one.map((r: { text: string }) => r.text)).toEqual(['Burst prayer number 0.']);
    expect((await as(admin).patch('/admin/radio-settings', { batchMax: 3 })).json().settings.radio_batch_max).toBe(3);
    const three = (await station('/station/claim-batch', { max: 10 })).json().radioPrayers;
    expect(three.map((r: { text: string }) => r.text)).toEqual(['Burst prayer number 1.', 'Burst prayer number 2.', 'Burst prayer number 3.']);
    expect((await station('/station/claim-batch', { max: 10 })).json().radioPrayers).toHaveLength(1);
    expect((await station('/station/claim-batch')).statusCode).toBe(204);
    for (const r of [...one, ...three]) await station(`/station/radio-prayers/${r.id}/result`, { ok: true, callSign: 'N0CALL' });
  });

  it('allows Amplify up to 1,000 copies for burst-mode stations, and no more', async () => {
    expect((await as(admin).patch('/admin/radio-settings', { amplifyRepeats: 1000 })).json().settings.radio_amplify_repeats).toBe(1000);
    expect((await as(admin).patch('/admin/radio-settings', { amplifyRepeats: 1001 })).statusCode).toBe(400);
    await as(admin).patch('/admin/radio-settings', { amplifyRepeats: stationDefaults.radio_amplify_repeats });
  });

  it('logs each burst for Admin → Radio, newest first, from the station only', async () => {
    const burst = { callSign: 'N0CALL', mode: 'simulate', preset: 'fm-fast', prayers: 20, frames: 1, bytes: 117, seconds: 0.56, decoded: 20, ok: true };
    expect((await station('/station/bursts', burst)).statusCode).toBe(200);
    expect((await station('/station/bursts', { ...burst, mode: 'audio', decoded: null, ok: false, error: 'sound card busy' })).statusCode).toBe(200);
    expect((await station('/station/bursts', burst, 'wrong-key-wrong-key-wrong-key-00')).statusCode).toBe(401);
    expect((await station('/station/bursts', { ...burst, mode: 'smoke-signals' })).statusCode).toBe(400);
    const outsider = await createUser('Not Admin');
    expect((await as(outsider).get('/admin/radio-bursts')).statusCode).toBe(403);
    const { bursts } = (await as(admin).get('/admin/radio-bursts')).json();
    expect(bursts[0]).toMatchObject({ mode: 'audio', ok: false, error: 'sound card busy', decoded: null, prayers: 20 });
    expect(bursts[1]).toMatchObject({ mode: 'simulate', ok: true, error: null, decoded: 20, seconds: 0.56, preset: 'fm-fast', bytes: 117 });
  });

  it('sends "on the air" receipts with the time and preset, and "heard" receipts when a listener decodes it', async () => {
    await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
    await as(admin).patch('/admin/radio-settings', { transmitter: 'station', order: 'oldest', batchMax: 10 });
    await tokens.updateSettings(db, { radio_funding: 'free' });
    const poster = await createUser('Receipt Poster');
    const earlier = await createUser('Earlier Poster');
    const sender = await createUser('Receipt Sender');
    const text = `Pray for the night shift nurses, ward ${Date.now() % 100000}.`;
    const hash = createHash('sha256').update(text).digest('hex').slice(0, 32);
    const kinds = async (who: string) =>
      (await as(who).get('/me/notifications')).json().notifications.filter((n: { kind: string }) => n.kind.startsWith('radio_on_air') || n.kind === 'radio_heard');
    const sendOne = async (key: string, from = poster) => {
      const p = await newRequest(from, text);
      await as(sender).post(`/posts/${p.id}/radio`, { idempotencyKey: key });
      const [c] = (await station('/station/claim-batch', { max: 10 })).json().radioPrayers;
      expect((await station(`/station/radio-prayers/${c.id}/result`, { ok: true, callSign: 'N0CALL', pieces: 1, preset: 'fm-qam16', sentHash: hash })).statusCode).toBe(200);
      return c.id as string;
    };
    const heard = (body: object) => app.inject({ method: 'POST', url: '/listen/heard', payload: { callSign: 'N0CALL', preset: 'fm-qam16', snrDb: 18.2, hashes: [hash], ...body } });

    // Off by default: no receipt, and listeners' reports are a 404.
    const quietId = await sendOne('receipt-off', earlier);
    expect(await kinds(sender)).toEqual([]);
    expect((await heard({})).statusCode).toBe(404);

    expect((await as(admin).patch('/admin/radio-settings', { receipts: true })).json().settings.radio_receipts_enabled).toBe(true);
    const id = await sendOne('receipt-on');
    const [onAir] = await kinds(sender);
    expect(onAir).toMatchObject({ kind: 'radio_on_air', title: 'Your radio prayer is on the air', data: { radioPrayerId: id, preset: 'fm-qam16' } });
    expect(onAir.body).toMatch(/^It went out at \d{1,2}:\d{2} [AP]M UTC from N0CALL on fm-qam16\.$/);
    expect(await kinds(poster)).toEqual([]);

    // A wrong call sign or a malformed fingerprint matches nothing.
    expect((await heard({ callSign: 'K1XYZ' })).json().matched).toBe(0);
    expect((await heard({ hashes: ['not-a-hash'] })).statusCode).toBe(400);
    // Both prayers carry the same words; each is heard once, and only the first report notifies.
    expect((await heard({})).json().matched).toBe(2);
    expect((await heard({ snrDb: 25 })).json().matched).toBe(2);
    const senderHeard = (await kinds(sender)).filter((n: { kind: string }) => n.kind === 'radio_heard');
    expect(senderHeard).toHaveLength(2);
    expect(senderHeard[0]).toMatchObject({ title: 'A listener heard your radio prayer' });
    expect(senderHeard[0].body).toMatch(/^Someone near a radio decoded it at /);
    for (const who of [poster, earlier]) {
      expect((await kinds(who)).map((n: { title: string }) => n.title)).toEqual(['A listener heard your request on the air']);
    }
    const { rows } = await db.query('select heard_count, heard_snr_db from public.radio_prayers where id = any($1::uuid[]) order by id', [[quietId, id]]);
    expect(rows).toEqual([{ heard_count: 2, heard_snr_db: 25 }, { heard_count: 2, heard_snr_db: 25 }]);
    // The listening page offers to send fingerprints only while receipts are on.
    await as(admin).patch('/admin/radio-settings', { listenPage: true });
    expect((await app.inject({ method: 'GET', url: '/listen' })).body).toContain('id="receipts-on"');
    await as(admin).patch('/admin/radio-settings', { receipts: false, batchMax: 1 });
    expect((await app.inject({ method: 'GET', url: '/listen' })).body).not.toContain('id="receipts-on"');
    await as(admin).patch('/admin/radio-settings', { listenPage: false });
  });

  it('shows counts of what really went out on the public on-the-air page, never the words', async () => {
    expect((await app.inject({ method: 'GET', url: '/on-the-air' })).statusCode).toBe(404);
    await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
    await as(admin).patch('/admin/radio-settings', { transmitter: 'station', batchMax: 10 });
    await tokens.updateSettings(db, { radio_funding: 'free' });
    const poster = await createUser('On Air Poster');
    const secret = `Pray for my private matter ${Date.now()}.`;
    const p = await newRequest(poster, secret);
    await as(poster).post(`/posts/${p.id}/radio`, { idempotencyKey: 'on-air-1' });
    const before = (await db.query(`select count(*)::int as n from public.radio_prayers where status = 'transmitted' and transmitter = 'station' and transmitted_at > now() - interval '1 day'`)).rows[0].n;
    const [c] = (await station('/station/claim-batch', { max: 10 })).json().radioPrayers;
    await station(`/station/radio-prayers/${c.id}/result`, { ok: true, callSign: 'N0CALL', preset: 'fm-standard' });
    await station('/station/bursts', { callSign: 'N0CALL', mode: 'audio', preset: 'fm-standard<script>', prayers: 1, frames: 1, bytes: 40, seconds: 1.23, ok: true });
    await station('/station/bursts', { callSign: 'N0CALL', mode: 'simulate', preset: 'sim-only-preset', prayers: 99, frames: 1, bytes: 40, seconds: 9.87, ok: true });
    expect((await as(admin).patch('/admin/radio-settings', { onAirPage: true })).json().settings.on_air_page_enabled).toBe(true);
    const page = (await app.inject({ method: 'GET', url: '/on-the-air' })).body;
    expect(page).toContain('Prayers on the air');
    expect(page).toContain(`<p class="big">${before + 1}</p>`);
    expect(page).toContain('1.23 s');
    expect(page).toContain('fm-standard&lt;script&gt;');
    expect(page).not.toContain('sim-only-preset');
    expect(page).not.toContain(secret);
    expect(page).not.toContain('On Air Poster');
    await as(admin).patch('/admin/radio-settings', { onAirPage: false, batchMax: 1 });
    expect((await app.inject({ method: 'GET', url: '/on-the-air' })).statusCode).toBe(404);
  });
});
