// Radio module: spend Priestly tokens to send a request out over the
// intercessory radio infrastructure. The spend, the queue row and the job are
// one transaction; the worker transmits and tells the requester.
import type { Task } from 'graphile-worker';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, conflict, notFound } from '../../errors.js';
import { enqueue } from '../../jobs.js';
import * as materialMatch from '../material-match/index.js';
import * as moderation from '../moderation/index.js';
import * as notifications from '../notifications/index.js';
import * as posts from '../posts/index.js';
import * as tokens from '../tokens/index.js';
import { requireFeature } from '../communities/index.js';

export interface RadioPrayer {
  id: string;
  post_id: string;
  cost: number;
  repeats: number;
  status: 'queued' | 'sending' | 'transmitted' | 'failed';
  created_at: Date;
  transmitted_at: Date | null;
}

/** Sends one prayer out. Swap in the real radio integration here. */
export type Transmitter = (p: { id: string; postId: string; body: string }) => Promise<{ transmitter: string }>;

export const logTransmitter: Transmitter = async (p) => {
  console.log(`[radio] transmitting prayer ${p.id} for post ${p.postId}`);
  return { transmitter: 'log' };
};

/**
 * Queue a radio prayer. Amplify sends it `radio_amplify_repeats` times. It is free
 * while radio prayers are free; otherwise it costs `amplify_paid_cost` Priestly
 * tokens, and is refused while no admin has set that price.
 */
export async function queue(q: Queryable, userId: string, postId: string, key: string, amplify = false): Promise<RadioPrayer> {
  await requireFeature(q, userId, 'radio');
  const post = await posts.getActionable(q, userId, postId);
  if (!post) throw notFound('Post');
  posts.requirePrayable(post);
  const s = await tokens.settings(q);
  const existing = await q.query<RadioPrayer>(
    `select id, post_id, cost, repeats, status, created_at, transmitted_at
       from public.radio_prayers where user_id = $1 and (idempotency_key = $2 or (cost = 0 and status <> 'failed' and post_id = $3 and (repeats > 1) = $4))`,
    [userId, key, post.id, amplify],
  );
  if (existing.rows[0]) return existing.rows[0];
  // Sensitive requests never go out (the transmit job would refuse them), so don't take tokens for one.
  if (post.is_sensitive) throw conflict("Sensitive requests aren't sent by radio.");
  // 'free' mode: no tokens move; Priestly tokens are donations only.
  if (await moderation.awaitingCrisisReview(q, post.id)) throw conflict('This request is waiting for a moderator to check in with the person who posted it. It can be amplified after that.');
  // Paid Amplify is off unless an admin set its price (token_settings.amplify_paid_cost).
  const paidAmplify = amplify && s.radio_funding !== 'free';
  if (paidAmplify && s.amplify_paid_cost === null) {
    throw conflict('Amplify is only available while radio prayers are free. An admin can set a token price for Amplify on the Admin screen.');
  }
  const station = await stationSettings(q);
  // The station won't send paid prayers (claimNext), so don't take tokens for one it would never send.
  if (station.radio_transmitter === 'station' && station.radio_station_requires_free && s.radio_funding !== 'free') {
    throw conflict('Radio prayers are paused: the station only sends while they are free. An admin can turn on “Radio prayers are free” on the Admin screen.');
  }
  const repeats = amplify ? station.radio_amplify_repeats : 1;
  const cost = s.radio_funding === 'free' ? 0 : paidAmplify ? s.amplify_paid_cost! : s.radio_prayer_cost;
  const t = cost > 0 ? await tokens.spendOnRadio(q, userId, cost, key) : null;
  const { rows } = await q.query<RadioPrayer>(
    `insert into public.radio_prayers (post_id, user_id, transfer_id, cost, idempotency_key, repeats) values ($1, $2, $3, $4, $5, $6)
     returning id, post_id, cost, repeats, status, created_at, transmitted_at`,
    [post.id, userId, t?.id ?? null, cost, key, repeats],
  );
  // Equal material help for the afflicted, when that switch is on (modules/material-match).
  if (t) await materialMatch.onRadioSpend(q, rows[0]!.id, userId, cost);
  await enqueue(q, 'radio_transmit', { radioPrayerId: rows[0]!.id }, { jobKey: `radio_transmit:${rows[0]!.id}` });
  return rows[0]!;
}

export async function mine(q: Queryable, userId: string): Promise<RadioPrayer[]> {
  const { rows } = await q.query<RadioPrayer>(
    `select id, post_id, cost, repeats, status, created_at, transmitted_at
       from public.radio_prayers where user_id = $1 order by id desc limit 50`,
    [userId],
  );
  return rows;
}

/** Why a queued prayer must not go out now: 'wait' while a moderator is still reviewing it. */
function holdReason(r: { moderation_status: string; is_sensitive: boolean; pending_review: boolean }): string | 'wait' | null {
  if (r.moderation_status !== 'visible') return 'request removed or hidden';
  if (r.is_sensitive) return 'sensitive request';
  return r.pending_review ? 'wait' : null;
}
const QUEUED_PRAYER = `select r.id, r.post_id, p.body, p.user_id as poster_id, r.user_id as sender_id, r.repeats,
            p.moderation_status, p.is_sensitive,
            exists (select 1 from public.moderation_items m
                     where m.target_type = 'post' and m.target_id = p.id and m.status = 'pending') as pending_review
       from public.radio_prayers r join public.posts p on p.id = r.post_id`;
type QueuedPrayer = { id: string; post_id: string; body: string; poster_id: string; sender_id: string; repeats: number; moderation_status: string; is_sensitive: boolean; pending_review: boolean };

/** A prayer that will never go out gives back the Priestly tokens spent on it. */
async function failAndRefund(q: Queryable, id: string, error: string) {
  const { rows } = await q.query<{ transfer_id: string | null; user_id: string; post_id: string }>(
    `update public.radio_prayers set status = 'failed', error = $2 where id = $1 returning transfer_id, user_id, post_id`,
    [id, error.slice(0, 500)],
  );
  const r = rows[0];
  if (!r) return;
  if (r.transfer_id) {
    await tokens.clawback(q, r.transfer_id, r.user_id, 'Radio prayer not sent: refunded');
    await materialMatch.onRadioRefund(q, id);
  }
  // Tell the sender, without the reason: it can name a moderator's decision or the station's fault.
  await notifications.notify(q, r.user_id, {
    kind: 'radio_not_sent',
    title: "A radio prayer you sent didn't go out",
    body: r.transfer_id ? 'Your Priestly token is back in your balance.' : 'You can still pray for the request.',
    t: { key: 'radio_not_sent', params: { refunded: !!r.transfer_id } },
    data: { postId: r.post_id },
    dedupeKey: `radio_not_sent:${id}`,
  });
}

export function transmitTask(q: Queryable, transmit: Transmitter = logTransmitter): Task {
  return async (payload) => {
    const { radioPrayerId } = payload as { radioPrayerId: string };
    // In station mode the prayer stays queued until the station worker claims it.
    if ((await stationSettings(q)).radio_transmitter === 'station') return;
    const { rows } = await q.query<QueuedPrayer>(`${QUEUED_PRAYER} where r.id = $1 and r.status = 'queued'`, [radioPrayerId]);
    const r = rows[0];
    if (!r) return;
    // The same checks as the station: removed or sensitive requests never go out, and
    // ones a moderator is still reviewing wait (this job runs again in 15 minutes).
    const hold = holdReason(r);
    if (hold === 'wait') {
      await enqueue(q, 'radio_transmit', { radioPrayerId }, { jobKey: `radio_transmit:${r.id}`, runAt: new Date(Date.now() + 15 * 60_000) });
      return;
    }
    if (hold) return failAndRefund(q, r.id, `not sent: ${hold}`);
    try {
      let transmitter = '';
      for (let i = 0; i < r.repeats; i++) ({ transmitter } = await transmit({ id: r.id, postId: r.post_id, body: r.body }));
      await q.query(
        `update public.radio_prayers set status = 'transmitted', transmitter = $2, transmitted_at = now() where id = $1`,
        [r.id, transmitter],
      );
    } catch (err) {
      await failAndRefund(q, r.id, String(err));
      return;
    }
    await markAmplified(q, r);
    await tellPoster(q, r);
  };
}

/** An amplified prayer that went out moves its request to the 'amplified' state. */
async function markAmplified(q: Queryable, r: { id: string; post_id: string }) {
  await q.query(
    `update public.posts p set state = 'amplified' from public.radio_prayers r
      where r.id = $1 and r.repeats > 1 and p.id = $2 and p.state = 'actively_prayed'`,
    [r.id, r.post_id],
  );
}

async function tellPoster(q: Queryable, r: { id: string; post_id: string; poster_id: string; sender_id: string }) {
  if (r.poster_id === r.sender_id) return;
  await notifications.notify(q, r.poster_id, {
    kind: 'radio_prayer',
    title: 'Your request went out as a radio prayer',
    body: 'Someone sent it out so more people could pray with you.',
    t: { key: 'radio_prayer' },
    data: { postId: r.post_id },
    dedupeKey: `radio_prayer:${r.id}`,
  });
}

// Station mode -------------------------------------------------------------------
// The station (a Raspberry Pi or laptop running fldigi next to the transceiver)
// claims one prayer at a time over the API, sends it as PSK31 and reports back.
// See docs/RADIO_STATION.md and the Queue-to-PSK31 build paper.

export interface StationSettings {
  radio_transmitter: 'log' | 'station';
  /** Amateur rules forbid tying a transmission to payment: hand out prayers only while radio_funding is 'free'. */
  radio_station_requires_free: boolean;
  radio_max_chars: number;
  /** How many times Amplify sends a prayer (placeholder; "1,000x" is not possible on PSK31). */
  radio_amplify_repeats: number;
}

export async function stationSettings(q: Queryable): Promise<StationSettings> {
  const { rows } = await q.query<StationSettings>(
    'select radio_transmitter, radio_station_requires_free, radio_max_chars, radio_amplify_repeats from public.token_settings',
  );
  return rows[0]!;
}

export async function updateStationSettings(q: Queryable, patch: Partial<StationSettings>): Promise<StationSettings> {
  const { rows } = await q.query<StationSettings>(
    `update public.token_settings
        set radio_transmitter = coalesce($1, radio_transmitter),
            radio_station_requires_free = coalesce($2, radio_station_requires_free),
            radio_max_chars = coalesce($3, radio_max_chars),
            radio_amplify_repeats = coalesce($4, radio_amplify_repeats)
      returning radio_transmitter, radio_station_requires_free, radio_max_chars, radio_amplify_repeats`,
    [patch.radio_transmitter ?? null, patch.radio_station_requires_free ?? null, patch.radio_max_chars ?? null, patch.radio_amplify_repeats ?? null],
  );
  return rows[0]!;
}

/** A claim the station hasn't reported on within this long is handed out again. */
const CLAIM_TIMEOUT_MINUTES = 15;

/**
 * Hand the station the oldest queued prayer it may send, or null. Never sends
 * a name: only the request text. Skips (and fails) requests that were removed,
 * are marked sensitive, or have moderation still pending.
 */
export async function claimNext(q: Queryable): Promise<{ id: string; text: string; repeats: number } | null> {
  const s = await stationSettings(q);
  if (s.radio_transmitter !== 'station') throw conflict('Radio is not in station mode');
  if (s.radio_station_requires_free && (await tokens.settings(q)).radio_funding !== 'free') {
    throw conflict('Amateur rules: the station only sends while radio prayers are free (radio_funding = free)');
  }
  await q.query(
    `update public.radio_prayers set status = 'queued', claimed_at = null
      where status = 'sending' and claimed_at < now() - make_interval(mins => $1)`,
    [CLAIM_TIMEOUT_MINUTES],
  );
  for (let i = 0; i < 20; i++) {
    // Requests a moderator hasn't finished with wait in the queue; they go out once reviewed.
    const { rows } = await q.query<{ id: string; body: string; moderation_status: string; is_sensitive: boolean; repeats: number }>(
      `select r.id, p.body, p.moderation_status, p.is_sensitive, r.repeats
         from public.radio_prayers r join public.posts p on p.id = r.post_id
        where r.status = 'queued'
          and not exists (select 1 from public.moderation_items m
                           where m.target_type = 'post' and m.target_id = p.id and m.status = 'pending')
        order by r.id limit 1 for update of r skip locked`,
    );
    const r = rows[0];
    if (!r) return null;
    const skip = holdReason({ ...r, pending_review: false });
    if (skip) {
      await failAndRefund(q, r.id, `not sent: ${skip}`);
      continue;
    }
    await q.query(`update public.radio_prayers set status = 'sending', claimed_at = now() where id = $1`, [r.id]);
    return { id: r.id, text: r.body.replace(/\s+/g, ' ').trim().slice(0, s.radio_max_chars), repeats: r.repeats };
  }
  return null;
}

export const StationResult = z.object({
  ok: z.boolean(),
  callSign: z.string().trim().min(3).max(20),
  pieces: z.number().int().min(1).max(5000).optional(),
  error: z.string().max(500).optional(),
});

export async function reportResult(q: Queryable, id: string, result: z.infer<typeof StationResult>) {
  const { rows } = await q.query<{ id: string; post_id: string; poster_id: string; sender_id: string }>(
    `update public.radio_prayers r
        set status = $2::public.radio_prayer_status, transmitter = 'station', call_sign = $3, pieces = $4, error = $5,
            transmitted_at = case when $2::public.radio_prayer_status = 'transmitted' then now() end
       from public.posts p
      where r.id = $1 and r.status = 'sending' and p.id = r.post_id
      returning r.id, r.post_id, p.user_id as poster_id, r.user_id as sender_id`,
    [id, result.ok ? 'transmitted' : 'failed', result.callSign, result.pieces ?? null, result.ok ? null : (result.error ?? 'station error')],
  );
  const r = rows[0];
  if (!r) throw badRequest('That radio prayer is not being sent');
  if (!result.ok) await failAndRefund(q, r.id, result.error ?? 'station error');
  if (result.ok) {
    await markAmplified(q, r);
    await tellPoster(q, r);
  }
}

/**
 * Prayer Cast log: what actually went out, newest first. Only the request
 * text (never names), and never sensitive, removed or crisis requests. Real records
 * only: no estimated reach or distance (no-fake-functionality rule).
 */
export async function castLog(q: Queryable, viewerId: string, limit = 50) {
  const { rows } = await q.query<{
    id: string;
    post_id: string;
    text: string;
    repeats: number;
    transmitter: string | null;
    call_sign: string | null;
    transmitted_at: Date;
  }>(
    `select r.id, r.post_id, left(regexp_replace(p.body, '\\s+', ' ', 'g'), 280) as text, r.repeats, r.transmitter, r.call_sign, r.transmitted_at
       from public.radio_prayers r join public.posts p on p.id = r.post_id
      where r.status = 'transmitted' and p.moderation_status = 'visible' and not p.is_sensitive
        and p.community_id = public.member_community_id($2)
        and not exists (select 1 from public.moderation_items m where m.target_type = 'post' and m.target_id = p.id and m.source = 'crisis')
      order by r.transmitted_at desc limit $1`,
    [limit, viewerId],
  );
  const { rows: totals } = await q.query<{ prayers: number; sends: number }>(
    `select count(*)::int as prayers, coalesce(sum(r.repeats), 0)::int as sends
       from public.radio_prayers r join public.posts p on p.id = r.post_id
      where r.status = 'transmitted' and p.community_id = public.member_community_id($1)`,
    [viewerId],
  );
  return { totals: totals[0]!, cast: rows };
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
