// "My signal queue" (docs/STATION_OPERATOR_GUIDE.md, "My signal queue"), from
// the first prototype's Signal Queue tab: the member's own radio prayers, newest
// first, each with where it is (waiting, going out, sent, not sent), whether it
// was amplified, how many receivers reported it, and its signal code: made from
// the fingerprint of the exact text that went out (packages/shared signalCode),
// so a listener who decodes it sees the same code on the Listen screen. Off
// until an admin turns on signal_queue_enabled.
import { signalCode } from '@prayer-tower/shared';
import type { Queryable } from '../../db.js';
import { notFound } from '../../errors.js';

export async function enabled(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ on: boolean }>('select signal_queue_enabled as on from public.token_settings');
  return rows[0]!.on;
}

export async function setEnabled(q: Queryable, on: boolean) {
  await q.query('update public.token_settings set signal_queue_enabled = $1', [on]);
}

/** Signal journey: how far each sent wave has gone (docs/STATION_OPERATOR_GUIDE.md, "Signal journey"). */
export async function journeyEnabled(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ on: boolean }>('select signal_journey_enabled as on from public.token_settings');
  return rows[0]!.on;
}

export async function setJourneyEnabled(q: Queryable, on: boolean) {
  await q.query('update public.token_settings set signal_journey_enabled = $1', [on]);
}

export interface SignalEntry {
  id: string;
  postId: string;
  excerpt: string;
  status: 'waiting' | 'sending' | 'sent' | 'not_sent';
  kind: string;
  amplified: boolean;
  /** Copies that went out (an amplified prayer goes out many times in one burst). */
  copies: number;
  queuedAt: string;
  sentAt: string | null;
  callSign: string | null;
  preset: string | null;
  heardCount: number;
  signalCode: string | null;
  /** The strongest report a listener node sent for it, in dB, or null. */
  bestSnrDb: number | null;
}

export async function mine(q: Queryable, userId: string): Promise<SignalEntry[]> {
  if (!(await enabled(q))) throw notFound('Signal queue');
  const { rows } = await q.query<{
    id: string; post_id: string; excerpt: string; status: string; kind: string; repeats: number; created_at: Date;
    transmitted_at: Date | null; call_sign: string | null; preset: string | null; heard_count: number; sent_hash: string | null; best_snr: number | null;
  }>(
    `select r.id, r.post_id, left(coalesce(r.sent_text, p.body), 120) as excerpt, r.status::text as status, r.kind, r.repeats, r.created_at,
            r.transmitted_at, r.call_sign, r.preset, r.heard_count, r.sent_hash,
            (select max(h.snr_db) from public.radio_prayer_heard h where h.radio_prayer_id = r.id) as best_snr
       from public.radio_prayers r join public.posts p on p.id = r.post_id
      where r.user_id = $1 and r.kind <> 'ceaseless'
      order by r.id desc limit 100`,
    [userId],
  );
  const status = (s: string): SignalEntry['status'] => (s === 'queued' ? 'waiting' : s === 'sending' ? 'sending' : s === 'transmitted' ? 'sent' : 'not_sent');
  return rows.map((r) => ({
    id: r.id,
    postId: r.post_id,
    excerpt: r.excerpt,
    status: status(r.status),
    kind: r.kind,
    amplified: r.repeats > 1,
    copies: r.repeats,
    queuedAt: r.created_at.toISOString(),
    sentAt: r.transmitted_at?.toISOString() ?? null,
    callSign: r.call_sign,
    preset: r.preset,
    heardCount: r.heard_count,
    signalCode: r.status === 'transmitted' && r.sent_hash ? signalCode(r.sent_hash) : null,
    bestSnrDb: r.best_snr === null ? null : Math.round(r.best_snr * 10) / 10,
  }));
}
