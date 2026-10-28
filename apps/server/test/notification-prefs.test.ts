// Notification settings: push per category, and quiet hours that hold a push until they end.
import type { JobHelpers } from 'graphile-worker';
import { afterAll, describe, expect, it } from 'vitest';
import * as notifications from '../src/modules/notifications/index.js';
import { as, config, createUser, db } from './helpers.js';

afterAll(() => db.end());

const quiet = (start: string, end: string, timeZone = 'America/Chicago') => ({ off: [], quietHours: { start, end, timeZone } });

describe('quiet hours', () => {
  it('holds pushes inside a window that crosses midnight, until it ends', () => {
    // 03:30 in Chicago (CDT, UTC-5) on 2026-10-28 is 08:30 UTC.
    const night = new Date('2026-10-28T08:30:00Z');
    expect(notifications.quietUntil(quiet('22:00', '07:00'), night)?.toISOString()).toBe('2026-10-28T12:00:00.000Z');
    // 14:00 in Chicago: outside.
    expect(notifications.quietUntil(quiet('22:00', '07:00'), new Date('2026-10-28T19:00:00Z'))).toBeNull();
    // A daytime window, and none at all.
    expect(notifications.quietUntil(quiet('13:00', '15:00'), new Date('2026-10-28T19:00:00Z'))?.toISOString()).toBe('2026-10-28T20:00:00.000Z');
    expect(notifications.quietUntil({ off: [], quietHours: null }, night)).toBeNull();
  });

  it('keeps safety notices on whatever is turned off', () => {
    const prefs = { off: ['prayers' as const, 'messages' as const], quietHours: null };
    expect(notifications.wantsPush(prefs, 'praying_now')).toBe(false);
    expect(notifications.wantsPush(prefs, 'message')).toBe(false);
    expect(notifications.wantsPush(prefs, 'commitment_reminder')).toBe(true);
    expect(notifications.wantsPush(prefs, 'moderation_notice')).toBe(true);
  });
});

describe('notification settings', () => {
  it('are saved on the profile and decide whether a push is sent', async () => {
    const member = await createUser('Quiet');
    const bad = await as(member).patch('/me', { notificationPrefs: { off: [], quietHours: { start: '22:00', end: '07:00', timeZone: 'Mars/Olympus' } } });
    expect(bad.statusCode).toBe(400);
    const res = await as(member).patch('/me', { notificationPrefs: { off: ['prayers'], quietHours: null } });
    expect(res.statusCode).toBe(200);
    expect((await as(member).get('/me')).json().profile.notification_prefs).toEqual({ off: ['prayers'], quietHours: null });

    await db.query(`insert into public.push_tokens (user_id, token) values ($1, $2)`, [member, `ExponentPushToken[${member}]`]);
    const sent: unknown[] = [];
    const fetchImpl = (async (_url: string, init: { body: string }) => {
      sent.push(...JSON.parse(init.body));
      return new Response(JSON.stringify({ data: [{ status: 'ok' }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const task = notifications.sendPushTask(db, { ...config, PUSH_ENABLED: '1' }, fetchImpl);
    const helpers = { logger: { warn: () => undefined } } as unknown as JobHelpers;

    const prayed = await notifications.notify(db, member, { kind: 'praying_now', title: 'Someone is praying', body: 'for you' });
    await task({ notificationId: prayed }, helpers);
    expect(sent).toHaveLength(0);

    const promise = await notifications.notify(db, member, { kind: 'commitment_reminder', title: 'Time to pray', body: 'You promised' });
    await task({ notificationId: promise }, helpers);
    expect(sent).toHaveLength(1);

    // Quiet from an hour ago to an hour from now: the push waits for a later job.
    const hhmm = (d: Date) => d.toISOString().slice(11, 16);
    const window = { start: hhmm(new Date(Date.now() - 3600_000)), end: hhmm(new Date(Date.now() + 3600_000)), timeZone: 'UTC' };
    await as(member).patch('/me', { notificationPrefs: { off: [], quietHours: window } });
    const held = await notifications.notify(db, member, { kind: 'message', title: 'New message', body: 'Hello' });
    await task({ notificationId: held }, helpers);
    expect(sent).toHaveLength(1);
    const { rows } = await db.query(`select run_at from graphile_worker.jobs where key = $1`, [`push-held:${held}`]);
    expect(rows).toHaveLength(1);

    // Safety and staff alerts are never held back.
    const crisis = await notifications.notify(db, member, { kind: 'crisis_flag', title: 'Someone may be in danger', body: 'Open the moderation queue' });
    await task({ notificationId: crisis }, helpers);
    expect(sent).toHaveLength(2);
  });
});
