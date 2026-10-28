// Notifications module: in-app rows plus push through the Expo Push Service.
import type { Task } from 'graphile-worker';
import type { Config } from '../../config.js';
import type { Queryable } from '../../db.js';
import { enqueue } from '../../jobs.js';

export interface NewNotification {
  kind: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** A repeat with the same key for the same user is dropped. */
  dedupeKey?: string;
}

/** Write the in-app notification and queue its push, in the caller's transaction. */
export async function notify(q: Queryable, userId: string, n: NewNotification): Promise<string | null> {
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
    const { rows } = await q.query<{ title: string; body: string; data: object; token: string }>(
      `select n.title, n.body, n.data, p.token
         from public.notifications n
         join public.push_tokens p on p.user_id = n.user_id and p.disabled_at is null
        where n.id = $1`,
      [notificationId],
    );
    if (rows.length === 0 || config.PUSH_ENABLED === '0') return;

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
