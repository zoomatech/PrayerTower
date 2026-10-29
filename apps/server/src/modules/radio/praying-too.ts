// "I'm praying too" from a listener (docs/RADIO_BURST.md, "I'm praying too"),
// off until an admin turns on listener_praying_enabled. A listener who decoded
// a prayer taps the button; the app sends the prayer's fingerprint when it is
// online, never the words and nothing about the listener. Each tap adds one to
// that radio prayer's anonymous count, and the person who asked is told the
// first time that someone who heard it on the radio is praying too.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import * as notifications from '../notifications/index.js';

export async function enabled(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ on: boolean }>('select listener_praying_enabled as on from public.token_settings');
  return rows[0]!.on;
}

export async function setEnabled(q: Queryable, on: boolean) {
  await q.query('update public.token_settings set listener_praying_enabled = $1', [on]);
}

export const PrayingReport = z.object({
  callSign: z.string().trim().min(3).max(20),
  hashes: z.array(z.string().regex(/^[0-9a-f]{32}$/)).min(1).max(50),
});

/** A tap can arrive this long after the prayer went out (the phone may have been offline). */
const WINDOW_DAYS = 7;

/** Count the taps; returns how many radio prayers matched. */
export async function prayingToo(q: Queryable, report: z.infer<typeof PrayingReport>): Promise<number> {
  const { rows } = await q.query<{ id: string; post_id: string; poster_id: string; first: boolean }>(
    `update public.radio_prayers r set listener_praying = r.listener_praying + 1
       from public.posts p
      where p.id = r.post_id and r.sent_hash = any($1::text[]) and r.status = 'transmitted' and r.kind in ('prayer', 'auto')
        and upper(r.call_sign) = upper($2) and r.transmitted_at > now() - make_interval(days => $3)
      returning r.id, r.post_id, p.user_id as poster_id, r.listener_praying = 1 as first`,
    [[...new Set(report.hashes)], report.callSign, WINDOW_DAYS],
  );
  for (const r of rows.filter((x) => x.first)) {
    await notifications.notify(q, r.poster_id, {
      kind: 'radio_praying_too',
      title: 'Someone who heard your request on the radio is praying too',
      body: 'A listener decoded it on the air and joined in.',
      data: { postId: r.post_id, radioPrayerId: r.id },
      dedupeKey: `radio_praying_too:${r.id}`,
    });
  }
  return rows.length;
}
