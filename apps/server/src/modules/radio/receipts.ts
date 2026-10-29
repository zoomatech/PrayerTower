// "On the air" receipts (docs/RADIO_BURST.md, "Receipts"), off unless Admin →
// Radio turns them on. When a radio prayer goes out, the member who sent it is
// told when and on which preset; when a listener's /listen page or the app's
// Listen screen decodes it, the sender and the person who asked are told it was
// heard. A listener sends back only a fingerprint of each prayer it decoded
// (sentHash on the station), never the words, its location or who it is.
// English only for now; Open Circle members get the automatic neutral wording.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import * as notifications from '../notifications/index.js';

export async function enabled(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ on: boolean }>('select radio_receipts_enabled as on from public.token_settings');
  return rows[0]?.on === true;
}

/** "2:05 PM UTC", in the member's quiet-hours time zone when they set one. */
async function timeFor(q: Queryable, userId: string, at: Date): Promise<string> {
  const { rows } = await q.query<{ tz: string | null }>(`select notification_prefs -> 'quietHours' ->> 'timeZone' as tz from public.profiles where id = $1`, [userId]);
  const format = (timeZone: string) => new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(at);
  try {
    return format(rows[0]?.tz || 'UTC');
  } catch {
    return format('UTC');
  }
}

/** Tell the sender their radio prayer went out. Called once the prayer is marked transmitted. */
export async function onAir(q: Queryable, radioPrayerId: string) {
  if (!(await enabled(q))) return;
  const { rows } = await q.query<{ user_id: string; post_id: string; preset: string | null; call_sign: string | null; transmitted_at: Date; kind: string }>(
    `select user_id, post_id, preset, call_sign, transmitted_at, kind from public.radio_prayers where id = $1 and status = 'transmitted'`,
    [radioPrayerId],
  );
  const r = rows[0];
  if (!r) return;
  const time = await timeFor(q, r.user_id, r.transmitted_at);
  const how = [r.call_sign ? `from ${r.call_sign}` : null, r.preset ? `on ${r.preset}` : null].filter(Boolean).join(' ');
  await notifications.notify(q, r.user_id, {
    kind: 'radio_on_air',
    title: r.kind === 'thanksgiving' ? 'Your answered request went out on the air' : 'Your radio prayer is on the air',
    body: `It went out at ${time}${how ? ` ${how}` : ''}.`,
    data: { postId: r.post_id, radioPrayerId, preset: r.preset, transmittedAt: r.transmitted_at.toISOString() },
    dedupeKey: `radio_on_air:${radioPrayerId}`,
  });
}

export const HeardReport = z.object({
  callSign: z.string().trim().min(3).max(20),
  preset: z.string().trim().min(1).max(40),
  snrDb: z.number().min(-50).max(100),
  hashes: z.array(z.string().regex(/^[0-9a-f]{32}$/)).min(1).max(500),
  /** The receiver's loudest sample around the frame, in dBFS (listener nodes; the setup wizard's level check). */
  peakDbfs: z.number().min(-200).max(20).optional(),
});

/** How long after it went out a prayer can still be reported heard. */
const HEARD_WINDOW_HOURS = 24;

/**
 * A listener heard these prayers. Each fingerprint matches prayers this call
 * sign sent in the last day; the first report of each tells its sender and
 * asker. Returns how many prayers matched (nothing else: a listener learns
 * nothing about who sent what).
 */
export async function heard(q: Queryable, report: z.infer<typeof HeardReport>): Promise<number> {
  const hashes = [...new Set(report.hashes)];
  const { rows } = await q.query<{ id: string; post_id: string; user_id: string; poster_id: string; first: boolean; heard_at: Date }>(
    `with hit as (
       select r.id, r.heard_at is null as first from public.radio_prayers r
        where r.sent_hash = any($1::text[]) and r.status = 'transmitted' and upper(r.call_sign) = upper($2)
          and r.transmitted_at > now() - make_interval(hours => $3)
        for update of r
     )
     update public.radio_prayers r
        set heard_count = r.heard_count + 1, heard_at = coalesce(r.heard_at, now()),
            heard_snr_db = greatest(coalesce(r.heard_snr_db, $4::real), $4::real)
       from hit, public.posts p
      where r.id = hit.id and p.id = r.post_id
      returning r.id, r.post_id, r.user_id, p.user_id as poster_id, hit.first, r.heard_at`,
    [hashes, report.callSign, HEARD_WINDOW_HOURS, report.snrDb],
  );
  // A listener node's report also acknowledges the prayer (acks.ts); senders are told only while receipts are on.
  if (!(await enabled(q))) return rows.length;
  for (const r of rows.filter((x) => x.first)) {
    for (const userId of new Set([r.user_id, r.poster_id])) {
      const time = await timeFor(q, userId, r.heard_at);
      const asker = userId === r.poster_id && userId !== r.user_id;
      await notifications.notify(q, userId, {
        kind: 'radio_heard',
        title: asker ? 'A listener heard your request on the air' : 'A listener heard your radio prayer',
        body: `Someone near a radio decoded it at ${time}.`,
        data: { postId: r.post_id, radioPrayerId: r.id, heardAt: r.heard_at.toISOString() },
        dedupeKey: `radio_heard:${r.id}`,
      });
    }
  }
  return rows.length;
}
