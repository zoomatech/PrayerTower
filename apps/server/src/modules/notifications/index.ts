// Notifications module: in-app rows plus push through the Expo Push Service.
import { notificationCategory, type NotificationPrefs } from '@prayer-tower/shared';
import type { Task } from 'graphile-worker';
import type { Config } from '../../config.js';
import type { Queryable } from '../../db.js';
import { enqueue } from '../../jobs.js';
import { neutralText } from '../communities/neutral-text.js';
import { localize, neutralize, type Params } from './i18n.js';

export interface NewNotification {
  kind: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** A repeat with the same key for the same user is dropped. */
  dedupeKey?: string;
  /** Template in notifications/i18n.ts, used when the recipient reads another language. */
  t?: { key: string; params?: Params };
}

/** Write the in-app notification and queue its push, in the caller's transaction. */
export async function notify(q: Queryable, userId: string, n: NewNotification): Promise<string | null> {
  const { rows: who } = await q.query<{ locale: string; tradition: string }>(
    `select p.locale, c.tradition from public.profiles p, public.communities c
      where p.id = $1 and c.id = public.member_community_id($1)`,
    [userId],
  );
  const secular = who[0]?.tradition === 'secular';
  if (n.t) {
    // Open Circle members get the non-religious wording; others their language.
    const local = secular ? neutralize(n.t.key, n.t.params) : localize(who[0]?.locale, n.t.key, n.t.params);
    if (local) n = { ...n, ...local };
  }
  // A notice with no hand-written neutral wording still loses its religious words.
  if (secular) n = { ...n, title: neutralText(n.title), body: neutralText(n.body) };
  const { rows } = await q.query<{ id: string }>(
    `insert into public.notifications (user_id, kind, title, body, data, dedupe_key)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (user_id, dedupe_key) do nothing
     returning id`,
    [userId, n.kind, n.title, n.body, n.data ?? {}, n.dedupeKey ?? null],
  );
  const id = rows[0]?.id;
  if (!id) return null;
  await enqueue(q, 'notifications_send_push', { notificationId: id });
  return id;
}

export async function list(q: Queryable, userId: string, limit = 50) {
  const { rows } = await q.query(
    `select id, kind, title, body, data, read_at, created_at from public.notifications
      where user_id = $1 order by id desc limit $2`,
    [userId, limit],
  );
  return rows;
}

export async function markRead(q: Queryable, userId: string, ids: string[]) {
  await q.query(
    `update public.notifications set read_at = now() where user_id = $1 and id = any($2::uuid[]) and read_at is null`,
    [userId, ids],
  );
}

export async function registerPushToken(q: Queryable, userId: string, token: string, platform?: string) {
  await q.query(
    `insert into public.push_tokens (user_id, token, platform) values ($1, $2, $3)
     on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, disabled_at = null`,
    [userId, token, platform ?? null],
  );
}

/** Minutes since midnight at `now` in an IANA time zone. */
function localMinutes(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}
const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * When quiet hours are on and `now` falls inside them, the time they end;
 * otherwise null. A window may cross midnight (22:00 to 07:00).
 */
export function quietUntil(prefs: NotificationPrefs | null | undefined, now = new Date()): Date | null {
  const quiet = prefs?.quietHours;
  if (!quiet) return null;
  const start = toMinutes(quiet.start);
  const end = toMinutes(quiet.end);
  if (start === end) return null;
  const at = localMinutes(now, quiet.timeZone);
  const inside = start < end ? at >= start && at < end : at >= start || at < end;
  if (!inside) return null;
  const wait = (end - at + 24 * 60) % (24 * 60);
  return new Date(Math.floor(now.getTime() / 60_000) * 60_000 + wait * 60_000);
}

/** Whether this member wants a push for this kind (in-app notices are always kept). */
export function wantsPush(prefs: NotificationPrefs | null | undefined, kind: string): boolean {
  const category = notificationCategory(kind);
  return !category || !prefs?.off?.includes(category);
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

export function sendPushTask(q: Queryable, config: Config, fetchImpl: typeof fetch = fetch): Task {
  return async (payload, helpers) => {
    const { notificationId } = payload as { notificationId: string };
    const { rows } = await q.query<{ title: string; body: string; data: object; token: string; kind: string; prefs: NotificationPrefs; read: boolean }>(
      `select n.title, n.body, n.data, p.token, n.kind, pr.notification_prefs as prefs, n.read_at is not null as read
         from public.notifications n
         join public.profiles pr on pr.id = n.user_id
         join public.push_tokens p on p.user_id = n.user_id and p.disabled_at is null
        where n.id = $1`,
      [notificationId],
    );
    if (rows.length === 0 || config.PUSH_ENABLED === '0') return;
    const { kind, prefs, read } = rows[0]!;
    if (!wantsPush(prefs, kind)) return;
    // Quiet hours: send when they end, unless it was read in the app meanwhile. Kinds in no
    // category (crisis flags, moderation notices, ops and job alerts) are never held back.
    const until = notificationCategory(kind) ? quietUntil(prefs) : null;
    if (until) return enqueue(q, 'notifications_send_push', { notificationId, held: true }, { runAt: until, jobKey: `push-held:${notificationId}` });
    if (read && (payload as { held?: boolean }).held) return;

    // Expo accepts up to 100 messages per request.
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const res = await fetchImpl(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(config.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${config.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(batch.map((r) => ({ to: r.token, title: r.title, body: r.body, data: r.data }))),
      });
      if (!res.ok) throw new Error(`Expo push failed: ${res.status} ${await res.text()}`);
      const { data } = (await res.json()) as { data: ExpoTicket[] };
      for (const [j, ticket] of data.entries()) {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          await q.query('update public.push_tokens set disabled_at = now() where token = $1', [batch[j]!.token]);
        } else if (ticket.status === 'error') {
          helpers.logger.warn(`push ticket error: ${ticket.message}`);
        }
      }
    }
  };
}
