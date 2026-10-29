// Push delivery (Admin → Push delivery): every push recorded per device, retries
// that never send twice, Expo receipts read back, pushes about the same request
// folded, an hourly cap, and quiet hours. Expo is faked; no Apple key needed.
import type { JobHelpers } from 'graphile-worker';
import { afterAll, describe, expect, it } from 'vitest';
import * as delivery from '../src/modules/notifications/delivery.js';
import * as notifications from '../src/modules/notifications/index.js';
import { as, config, createUser, db } from './helpers.js';

afterAll(() => db.end());

const ON: delivery.PushSettings = { push_reliability_enabled: true, collapse_minutes: 10, max_per_hour: 8 };
const helpers = { logger: { warn: () => undefined } } as unknown as JobHelpers;
const cfg = { ...config, PUSH_ENABLED: '1' as const, EXPO_PUSH_BASE_URL: 'https://expo.test' };

type Reply = { status?: number; tickets?: { status: 'ok' | 'error'; id?: string; details?: { error?: string } }[]; receipts?: Record<string, unknown> };
/** A stand-in Expo: each call takes the next scripted reply and records what was sent. */
function fakeExpo(replies: Reply[]) {
  const sent: { url: string; body: { to?: string; collapseId?: string }[] | { ids: string[] } }[] = [];
  const fetchImpl = (async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    sent.push({ url, body });
    const r = replies.shift() ?? {};
    if (r.status && r.status !== 200) return new Response('busy', { status: r.status });
    if (url.endsWith('/getReceipts')) return new Response(JSON.stringify({ data: r.receipts ?? {} }), { status: 200 });
    const tickets = r.tickets ?? (body as unknown[]).map((_, i) => ({ status: 'ok', id: `t-${Date.now()}-${i}-${Math.random()}` }));
    return new Response(JSON.stringify({ data: tickets }), { status: 200 });
  }) as unknown as typeof fetch;
  return { sent, fetchImpl };
}

async function member(devices = 1) {
  const id = await createUser('Push Member');
  const tokens: string[] = [];
  for (let i = 0; i < devices; i++) {
    const token = `ExponentPushToken[${id}-${i}]`;
    tokens.push(token);
    await db.query('insert into public.push_tokens (user_id, token) values ($1, $2)', [id, token]);
  }
  return { id, tokens };
}

const deliveries = async (notificationId: string) =>
  (await db.query<{ token: string; status: string; attempts: number; error: string | null }>('select token, status, attempts, error from public.push_deliveries where notification_id = $1 order by token', [notificationId])).rows;

describe('push delivery', () => {
  it('while off, sends as before and records nothing', async () => {
    const m = await member();
    const expo = fakeExpo([]);
    const task = notifications.sendPushTask(db, cfg, expo.fetchImpl, async () => ({ ...ON, push_reliability_enabled: false }));
    const n = await notifications.notify(db, m.id, { kind: 'praying_now', title: 'Someone is praying', body: 'for you' });
    await task({ notificationId: n }, helpers);
    expect(expo.sent).toHaveLength(1);
    expect(await deliveries(n!)).toEqual([]);
  });

  it('retries a busy Expo without sending twice, and only to the devices still waiting', async () => {
    const m = await member(2);
    const expo = fakeExpo([{ status: 503 }, { tickets: [{ status: 'ok', id: 'a1' }, { status: 'error', details: { error: 'MessageRateExceeded' } }] }, {}]);
    const task = notifications.sendPushTask(db, cfg, expo.fetchImpl, async () => ON);
    const n = (await notifications.notify(db, m.id, { kind: 'moderation_notice', title: 'A moderator decided', body: 'Open the app' }))!;

    await expect(task({ notificationId: n }, helpers)).rejects.toThrow(/slow down/);
    expect((await deliveries(n)).map((d) => d.status)).toEqual(['retry', 'retry']);

    // Second try: one device takes it, Expo asks to slow down for the other.
    await expect(task({ notificationId: n }, helpers)).rejects.toThrow(/slow down/);
    expect((await deliveries(n)).map((d) => [d.status, d.attempts])).toEqual([['sent', 2], ['retry', 2]]);

    // Third try sends only to the device still waiting.
    await task({ notificationId: n }, helpers);
    const third = expo.sent[2]!.body as { to: string }[];
    expect(third.map((x) => x.to)).toEqual([m.tokens[1]]);
    expect((await deliveries(n)).map((d) => d.status)).toEqual(['sent', 'sent']);

    // A repeated job sends nothing more.
    await task({ notificationId: n }, helpers);
    expect(expo.sent).toHaveLength(3);
  });

  it('records a refusal that will not fix itself without retrying, and turns off a dead device', async () => {
    const m = await member(2);
    const expo = fakeExpo([{ status: 400 }, { tickets: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }, { status: 'ok', id: 'b2' }] }]);
    const task = notifications.sendPushTask(db, cfg, expo.fetchImpl, async () => ON);
    const bad = (await notifications.notify(db, m.id, { kind: 'moderation_notice', title: 'One', body: 'x' }))!;
    await task({ notificationId: bad }, helpers);
    expect((await deliveries(bad)).map((d) => d.status)).toEqual(['error', 'error']);

    const n = (await notifications.notify(db, m.id, { kind: 'moderation_notice', title: 'Two', body: 'y' }))!;
    await task({ notificationId: n }, helpers);
    expect((await deliveries(n)).map((d) => [d.status, d.error])).toEqual([['error', 'DeviceNotRegistered'], ['sent', null]]);
    const { rows } = await db.query('select disabled_at from public.push_tokens where token = $1', [m.tokens[0]]);
    expect(rows[0].disabled_at).not.toBeNull();
  });

  it('folds a second push about the same request, caps everyday pushes per hour, and never folds safety notices', async () => {
    const m = await member();
    const expo = fakeExpo([]);
    const task = notifications.sendPushTask(db, cfg, expo.fetchImpl, async () => ({ ...ON, max_per_hour: 2 }));
    const postId = '00000000-0000-7000-8000-000000000001';
    const first = (await notifications.notify(db, m.id, { kind: 'praying_now', title: 'Ruth is praying', body: 'for you', data: { postId } }))!;
    const second = (await notifications.notify(db, m.id, { kind: 'praying_now', title: 'Sam is praying', body: 'for you', data: { postId } }))!;
    await task({ notificationId: first }, helpers);
    await task({ notificationId: second }, helpers);
    expect((expo.sent[0]!.body as { collapseId?: string }[])[0]!.collapseId).toBe(`praying_now:${postId}`);
    expect((await deliveries(second))[0]!.status).toBe('folded');

    const other = (await notifications.notify(db, m.id, { kind: 'praying_now', title: 'Ann is praying', body: 'for you', data: { postId: '00000000-0000-7000-8000-000000000002' } }))!;
    const third = (await notifications.notify(db, m.id, { kind: 'praying_now', title: 'Joe is praying', body: 'for you', data: { postId: '00000000-0000-7000-8000-000000000003' } }))!;
    await task({ notificationId: other }, helpers);
    await task({ notificationId: third }, helpers);
    expect((await deliveries(other))[0]!.status).toBe('sent');
    expect((await deliveries(third))[0]!.status).toBe('capped');

    const crisis = (await notifications.notify(db, m.id, { kind: 'crisis_flag', title: 'Someone may be in danger', body: 'Open the queue', data: { postId } }))!;
    await task({ notificationId: crisis }, helpers);
    expect((await deliveries(crisis))[0]!.status).toBe('sent');
    // The notices themselves all stay in the app.
    expect((await db.query('select 1 from public.notifications where user_id = $1', [m.id])).rowCount).toBe(5);
  });

  it('holds a push through quiet hours, and drops it if it was read in the app meanwhile', async () => {
    const m = await member();
    const hhmm = (d: Date) => d.toISOString().slice(11, 16);
    await db.query('update public.profiles set notification_prefs = $2 where id = $1', [
      m.id,
      { off: [], quietHours: { start: hhmm(new Date(Date.now() - 3600_000)), end: hhmm(new Date(Date.now() + 3600_000)), timeZone: 'UTC' } },
    ]);
    const expo = fakeExpo([]);
    const task = notifications.sendPushTask(db, cfg, expo.fetchImpl, async () => ON);
    const n = (await notifications.notify(db, m.id, { kind: 'message', title: 'New message', body: 'Hello' }))!;
    await task({ notificationId: n }, helpers);
    expect(expo.sent).toHaveLength(0);
    expect((await deliveries(n))[0]!.status).toBe('held');
    expect((await db.query('select 1 from graphile_worker.jobs where key = $1', [`push-held:${n}`])).rowCount).toBe(1);

    await db.query('update public.notifications set read_at = now() where id = $1', [n]);
    await db.query("update public.profiles set notification_prefs = '{\"off\": [], \"quietHours\": null}' where id = $1", [m.id]);
    await task({ notificationId: n, held: true }, helpers);
    expect(expo.sent).toHaveLength(0);
    expect((await deliveries(n))[0]).toMatchObject({ status: 'folded', error: 'read in the app first' });
  });

  it('reads receipts back: delivered, a dead device, slow down (sent again later), and lost', async () => {
    const m = await member(4);
    const n = (await notifications.notify(db, m.id, { kind: 'moderation_notice', title: 'Receipts', body: 'z' }))!;
    const ids = ['r-ok', 'r-dead', 'r-slow', 'r-later'].map((x) => `${x}-${n}`);
    for (const [i, token] of m.tokens.entries()) {
      await db.query(
        `insert into public.push_deliveries (notification_id, user_id, token, status, ticket_id, created_at) values ($1, $2, $3, 'sent', $4, now() - interval '20 minutes')`,
        [n, m.id, token, ids[i]],
      );
    }
    const lost = (await notifications.notify(db, m.id, { kind: 'moderation_notice', title: 'Lost', body: 'w' }))!;
    await db.query(
      `insert into public.push_deliveries (notification_id, user_id, token, status, ticket_id, created_at) values ($1, $2, $3, 'sent', 'r-gone', now() - interval '25 hours')`,
      [lost, m.id, m.tokens[0]],
    );
    const expo = fakeExpo([
      { receipts: { [ids[0]!]: { status: 'ok' }, [ids[1]!]: { status: 'error', details: { error: 'DeviceNotRegistered' } }, [ids[2]!]: { status: 'error', details: { error: 'MessageRateExceeded' } } } },
    ]);
    // Other test files' rows may be waiting too: only look at ours.
    await delivery.receiptsTask(db, cfg, expo.fetchImpl, async () => ON)();
    expect((expo.sent[0]!.body as { ids: string[] }).ids).toEqual(expect.arrayContaining(ids));
    expect((await deliveries(n)).map((d) => d.status)).toEqual(['ok', 'error', 'retry', 'sent']);
    expect((await db.query('select disabled_at from public.push_tokens where token = $1', [m.tokens[1]])).rows[0].disabled_at).not.toBeNull();
    expect((await db.query('select 1 from graphile_worker.jobs where key = $1', [`push-retry:${n}`])).rowCount).toBe(1);
    expect((await deliveries(lost))[0]).toMatchObject({ status: 'error', error: 'no receipt from Expo' });
  });

  it('shows admins the last day by outcome, behind an admin-only switch', async () => {
    const plain = await createUser('Not Admin');
    expect((await as(plain).get('/admin/push-settings')).statusCode).toBe(403);
    const admin = await createUser('Push Admin');
    await db.query(`insert into public.user_roles (user_id, role) values ($1, 'admin')`, [admin]);
    const r = await as(admin).get('/admin/push-settings');
    expect(r.json().settings.push_reliability_enabled).toBe(false);
    expect(r.json().health.byStatus).toBeTypeOf('object');
    const bad = await as(admin).patch('/admin/push-settings', { maxPerHour: 0 });
    expect(bad.statusCode).toBe(400);
    const ok = await as(admin).patch('/admin/push-settings', { collapseMinutes: 15 });
    expect(ok.json().settings.collapse_minutes).toBe(15);
    await as(admin).patch('/admin/push-settings', { collapseMinutes: 10 });
  });
});
