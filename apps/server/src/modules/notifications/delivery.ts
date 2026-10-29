// Push delivery (migration 20261029081000_push_reliability.sql), used while
// Admin → Push delivery is on. Every push to each device is recorded, so:
// - a retried job sends only to the devices that didn't get it (never twice);
// - Expo's "slow down" (HTTP 429, a 5xx, or a MessageRateExceeded ticket or
//   receipt) is sent again later with backoff; other refusals are not retried;
// - receipts are read back about 15 minutes later: a dead device's token is
//   turned off, and a missing receipt after 24 hours is recorded as an error;
// - a second push of the same kind about the same request within a few minutes
//   is folded, and everyday pushes are capped per member per hour. The notice
//   itself always stays in the app; safety and moderation notices (kinds in no
//   category) are never folded, capped or held.
// Nothing here needs the Apple key: Expo holds it. EXPO_PUSH_BASE_URL points
// the server at a stand-in Expo for testing.
// https://docs.expo.dev/push-notifications/sending-notifications/
import { notificationCategory, type NotificationPrefs } from '@prayer-tower/shared';
import type { JobHelpers } from 'graphile-worker';
import { z } from 'zod';
import type { Config } from '../../config.js';
import type { Queryable } from '../../db.js';
import { enqueue } from '../../jobs.js';

export interface PushSettings {
  push_reliability_enabled: boolean;
  collapse_minutes: number;
  max_per_hour: number;
}

export async function settings(q: Queryable): Promise<PushSettings> {
  const { rows } = await q.query<PushSettings>('select push_reliability_enabled, collapse_minutes, max_per_hour from public.push_settings');
  return rows[0] ?? { push_reliability_enabled: false, collapse_minutes: 10, max_per_hour: 8 };
}

export const SettingsPatch = z.object({
  enabled: z.boolean().optional(),
  collapseMinutes: z.number().int().min(0).max(1440).optional(),
  maxPerHour: z.number().int().min(1).max(100).optional(),
});

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  await q.query(
    `update public.push_settings set push_reliability_enabled = coalesce($1, push_reliability_enabled),
            collapse_minutes = coalesce($2, collapse_minutes), max_per_hour = coalesce($3, max_per_hour)`,
    [p.enabled ?? null, p.collapseMinutes ?? null, p.maxPerHour ?? null],
  );
  return settings(q);
}

export const sendUrl = (config: Config) => `${config.EXPO_PUSH_BASE_URL}/--/api/v2/push/send`;
export const receiptsUrl = (config: Config) => `${config.EXPO_PUSH_BASE_URL}/--/api/v2/push/getReceipts`;

interface Ticket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

type Status = 'sent' | 'ok' | 'error' | 'retry' | 'held' | 'folded' | 'capped';

async function record(q: Queryable, notificationId: string, userId: string, token: string, status: Status, extra: { ticket?: string; error?: string; resend?: boolean } = {}) {
  await q.query(
    `insert into public.push_deliveries (notification_id, user_id, token, status, ticket_id, error)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (notification_id, token) do update
       set status = excluded.status, ticket_id = coalesce(excluded.ticket_id, push_deliveries.ticket_id), error = excluded.error,
           attempts = push_deliveries.attempts + case when $7 then 1 else 0 end`,
    [notificationId, userId, token, status, extra.ticket ?? null, extra.error ?? null, extra.resend ?? false],
  );
}

/** A transient refusal: the job throws so the worker tries again later, with backoff. */
class TryAgain extends Error {}

export interface PushRow {
  user_id: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  token: string;
  kind: string;
  prefs: NotificationPrefs;
  read: boolean;
}

/**
 * Send one notice to the member's devices. `until` is when quiet hours end (or
 * null); `held` is set on the job that runs when they do.
 */
export async function sendRecorded(
  q: Queryable,
  config: Config,
  fetchImpl: typeof fetch,
  notificationId: string,
  rows: PushRow[],
  s: PushSettings,
  opts: { until: Date | null; held: boolean },
  helpers: Pick<JobHelpers, 'logger'>,
) {
  const { user_id: userId, kind, data } = rows[0]!;
  const category = notificationCategory(kind);
  const { rows: done } = await q.query<{ token: string; status: Status }>('select token, status from public.push_deliveries where notification_id = $1', [notificationId]);
  const state = new Map(done.map((d) => [d.token, d.status]));
  // Only devices that haven't had it: a retried job never sends twice.
  const todo = rows.filter((r) => [undefined, 'retry', 'held'].includes(state.get(r.token)));
  if (!todo.length) return;

  if (opts.until) {
    for (const r of todo) await record(q, notificationId, userId, r.token, 'held');
    await enqueue(q, 'notifications_send_push', { notificationId, held: true }, { runAt: opts.until, jobKey: `push-held:${notificationId}` });
    return;
  }
  if (opts.held && rows[0]!.read) {
    // Read in the app while quiet hours held it: nothing left to say.
    for (const r of todo) await record(q, notificationId, userId, r.token, 'folded', { error: 'read in the app first' });
    return;
  }
  if (category) {
    const postId = typeof data?.postId === 'string' ? data.postId : null;
    if (postId && s.collapse_minutes > 0) {
      const { rowCount } = await q.query(
        `select 1 from public.push_deliveries d join public.notifications n on n.id = d.notification_id
          where d.user_id = $1 and d.status in ('sent', 'ok') and d.notification_id <> $2 and n.kind = $3 and n.data ->> 'postId' = $4
            and d.created_at > now() - make_interval(mins => $5) limit 1`,
        [userId, notificationId, kind, postId, s.collapse_minutes],
      );
      if (rowCount) {
        for (const r of todo) await record(q, notificationId, userId, r.token, 'folded');
        return;
      }
    }
    const { rows: hour } = await q.query<{ n: number }>(
      `select count(distinct notification_id)::int as n from public.push_deliveries
        where user_id = $1 and status in ('sent', 'ok') and notification_id <> $2 and created_at > now() - interval '1 hour'`,
      [userId, notificationId],
    );
    if ((hour[0]?.n ?? 0) >= s.max_per_hour) {
      for (const r of todo) await record(q, notificationId, userId, r.token, 'capped');
      return;
    }
  }

  // iOS replaces a shown notice with the same collapseId: one line per request and kind.
  const collapseId = typeof data?.postId === 'string' ? `${kind}:${data.postId}`.slice(0, 64) : undefined;
  let again = false;
  for (let i = 0; i < todo.length; i += 100) {
    const batch = todo.slice(i, i + 100);
    const res = await fetchImpl(sendUrl(config), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(config.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${config.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(batch.map((r) => ({ to: r.token, title: r.title, body: r.body, data: r.data, ...(collapseId ? { collapseId } : {}) }))),
    });
    if (res.status === 429 || res.status >= 500) {
      for (const r of batch) await record(q, notificationId, userId, r.token, 'retry', { error: `HTTP ${res.status}`, resend: state.has(r.token) });
      again = true;
      continue;
    }
    if (!res.ok) {
      // A malformed request or missing credentials won't fix itself: record it, don't retry.
      const why = `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`;
      for (const r of batch) await record(q, notificationId, userId, r.token, 'error', { error: why });
      helpers.logger.warn(`push refused: ${why}`);
      continue;
    }
    const { data: tickets } = (await res.json()) as { data: Ticket[] };
    for (const [j, ticket] of tickets.entries()) {
      const r = batch[j]!;
      const resend = state.has(r.token);
      if (ticket.status === 'ok') await record(q, notificationId, userId, r.token, 'sent', { ticket: ticket.id, resend });
      else if (ticket.details?.error === 'DeviceNotRegistered') {
        await q.query('update public.push_tokens set disabled_at = now() where token = $1', [r.token]);
        await record(q, notificationId, userId, r.token, 'error', { error: 'DeviceNotRegistered', resend });
      } else if (ticket.details?.error === 'MessageRateExceeded') {
        await record(q, notificationId, userId, r.token, 'retry', { error: 'MessageRateExceeded', resend });
        again = true;
      } else await record(q, notificationId, userId, r.token, 'error', { error: ticket.details?.error ?? ticket.message ?? 'error', resend });
    }
  }
  if (again) throw new TryAgain('Expo asked us to slow down; the worker tries the waiting devices again later');
}

/**
 * Read back Expo's receipts for pushes sent 15 minutes to 24 hours ago (up to
 * 1,000 a request). Runs every 5 minutes; does nothing while switched off.
 */
export function receiptsTask(q: Queryable, config: Config, fetchImpl: typeof fetch = fetch, readSettings = settings) {
  return async () => {
    if (!(await readSettings(q)).push_reliability_enabled || config.PUSH_ENABLED === '0') return;
    // Receipts are gone after 24 hours: a push still without one is recorded as lost.
    await q.query(
      `update public.push_deliveries set status = 'error', error = 'no receipt from Expo', checked_at = now()
        where status = 'sent' and created_at < now() - interval '24 hours'`,
    );
    for (;;) {
      const { rows } = await q.query<{ id: string; ticket_id: string; token: string; notification_id: string; attempts: number }>(
        `select id, ticket_id, token, notification_id, attempts from public.push_deliveries
          where status = 'sent' and ticket_id is not null and created_at < now() - interval '15 minutes'
            and (checked_at is null or checked_at < now() - interval '15 minutes')
          order by created_at limit 1000`,
      );
      if (!rows.length) return;
      const res = await fetchImpl(receiptsUrl(config), {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(config.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${config.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify({ ids: rows.map((r) => r.ticket_id) }),
      });
      if (!res.ok) throw new Error(`Expo receipts failed: ${res.status}`);
      const { data = {} } = (await res.json()) as { data?: Record<string, Ticket> };
      for (const r of rows) {
        const receipt = data[r.ticket_id];
        if (!receipt) {
          // Not ready yet: look again next time (it's marked lost after 24 hours).
          await q.query('update public.push_deliveries set checked_at = now() where id = $1', [r.id]);
        } else if (receipt.status === 'ok') {
          await q.query(`update public.push_deliveries set status = 'ok', checked_at = now() where id = $1`, [r.id]);
        } else if (receipt.details?.error === 'MessageRateExceeded') {
          await q.query(`update public.push_deliveries set status = 'retry', error = 'MessageRateExceeded', checked_at = now() where id = $1`, [r.id]);
          const wait = Math.min(2 ** r.attempts, 60);
          await enqueue(q, 'notifications_send_push', { notificationId: r.notification_id }, { runAt: new Date(Date.now() + wait * 60_000), jobKey: `push-retry:${r.notification_id}` });
        } else {
          if (receipt.details?.error === 'DeviceNotRegistered') await q.query('update public.push_tokens set disabled_at = now() where token = $1', [r.token]);
          await q.query(`update public.push_deliveries set status = 'error', error = $2, checked_at = now() where id = $1`, [r.id, receipt.details?.error ?? receipt.message ?? 'error']);
        }
      }
    }
  };
}

/** Admin → Push delivery: the last 24 hours by outcome, and the commonest errors. */
export async function health(q: Queryable) {
  const { rows: counts } = await q.query<{ status: Status; n: number }>(
    `select status, count(*)::int as n from public.push_deliveries where created_at > now() - interval '24 hours' group by status`,
  );
  const { rows: errors } = await q.query<{ error: string; n: number }>(
    `select error, count(*)::int as n from public.push_deliveries
      where created_at > now() - interval '24 hours' and status in ('error', 'retry') and error is not null
      group by error order by n desc limit 5`,
  );
  const { rows: off } = await q.query<{ n: number }>(`select count(*)::int as n from public.push_tokens where disabled_at > now() - interval '24 hours'`);
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c.n])) as Partial<Record<Status, number>>;
  return { byStatus, errors, devicesTurnedOff: off[0]?.n ?? 0 };
}
