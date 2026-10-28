// Radio module: spend Priestly tokens to send a request out over the
// intercessory radio infrastructure. The spend, the queue row and the job are
// one transaction; the worker transmits and tells the requester.
import type { Task } from 'graphile-worker';
import type { Queryable } from '../../db.js';
import { notFound } from '../../errors.js';
import { enqueue } from '../../jobs.js';
import * as notifications from '../notifications/index.js';
import * as posts from '../posts/index.js';
import * as tokens from '../tokens/index.js';

export interface RadioPrayer {
  id: string;
  post_id: string;
  cost: number;
  status: 'queued' | 'transmitted' | 'failed';
  created_at: Date;
  transmitted_at: Date | null;
}

/** Sends one prayer out. Swap in the real radio integration here. */
export type Transmitter = (p: { id: string; postId: string; body: string }) => Promise<{ transmitter: string }>;

export const logTransmitter: Transmitter = async (p) => {
  console.log(`[radio] transmitting prayer ${p.id} for post ${p.postId}`);
  return { transmitter: 'log' };
};

export async function queue(q: Queryable, userId: string, postId: string, key: string): Promise<RadioPrayer> {
  const post = await posts.getVisible(q, postId);
  if (!post) throw notFound('Post');
  const s = await tokens.settings(q);
  const existing = await q.query<RadioPrayer>(
    `select id, post_id, cost, status, created_at, transmitted_at
       from public.radio_prayers where user_id = $1 and (idempotency_key = $2 or (cost = 0 and post_id = $3))`,
    [userId, key, post.id],
  );
  if (existing.rows[0]) return existing.rows[0];
  // 'free' mode: no tokens move; Priestly tokens are donations only.
  const cost = s.radio_funding === 'free' ? 0 : s.radio_prayer_cost;
  const t = cost > 0 ? await tokens.spendOnRadio(q, userId, cost, key) : null;
  const { rows } = await q.query<RadioPrayer>(
    `insert into public.radio_prayers (post_id, user_id, transfer_id, cost, idempotency_key) values ($1, $2, $3, $4, $5)
     returning id, post_id, cost, status, created_at, transmitted_at`,
    [post.id, userId, t?.id ?? null, cost, key],
  );
  await enqueue(q, 'radio_transmit', { radioPrayerId: rows[0]!.id }, { jobKey: `radio_transmit:${rows[0]!.id}` });
  return rows[0]!;
}

export async function mine(q: Queryable, userId: string): Promise<RadioPrayer[]> {
  const { rows } = await q.query<RadioPrayer>(
    `select id, post_id, cost, status, created_at, transmitted_at
       from public.radio_prayers where user_id = $1 order by id desc limit 50`,
    [userId],
  );
  return rows;
}

export function transmitTask(q: Queryable, transmit: Transmitter = logTransmitter): Task {
  return async (payload) => {
    const { radioPrayerId } = payload as { radioPrayerId: string };
    const { rows } = await q.query<{ id: string; post_id: string; body: string; poster_id: string; sender_id: string }>(
      `select r.id, r.post_id, p.body, p.user_id as poster_id, r.user_id as sender_id
         from public.radio_prayers r join public.posts p on p.id = r.post_id
        where r.id = $1 and r.status = 'queued'`,
      [radioPrayerId],
    );
    const r = rows[0];
    if (!r) return;
    try {
      const { transmitter } = await transmit({ id: r.id, postId: r.post_id, body: r.body });
      await q.query(
        `update public.radio_prayers set status = 'transmitted', transmitter = $2, transmitted_at = now() where id = $1`,
        [r.id, transmitter],
      );
    } catch (err) {
      await q.query(`update public.radio_prayers set status = 'failed', error = $2 where id = $1`, [r.id, String(err).slice(0, 500)]);
      throw err;
    }
    if (r.poster_id !== r.sender_id) {
      await notifications.notify(q, r.poster_id, {
        kind: 'radio_prayer',
        title: 'Your request went out as a radio prayer',
        body: 'Someone sent it out so more people could pray with you.',
        data: { postId: r.post_id },
        dedupeKey: `radio_prayer:${r.id}`,
      });
    }
  };
}

export async function metrics(q: Queryable, since: Date) {
  const { rows } = await q.query(
    `select count(*)::int as queued_total,
            count(*) filter (where status = 'transmitted')::int as transmitted,
            count(*) filter (where status = 'failed')::int as failed
       from public.radio_prayers where created_at >= $1`,
    [since],
  );
  return rows[0];
}
