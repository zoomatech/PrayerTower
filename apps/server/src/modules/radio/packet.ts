// Packet fallback (docs/RADIO_BURST.md, "Packet fallback"), off until an admin
// turns on radio_packet_enabled. A station with BURST_MODE=packet claims with
// mode 'packet' and sends only each prayer's short ID (the first six hex digits
// of its fingerprint) and the count, as APRS status packets. A listener node that
// decodes one reports the short IDs; they acknowledge the prayers like a burst
// receipt does.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import * as receipts from './receipts.js';

export async function enabled(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ on: boolean }>('select radio_packet_enabled as on from public.token_settings');
  return rows[0]?.on === true;
}

export async function setEnabled(q: Queryable, on: boolean) {
  await q.query('update public.token_settings set radio_packet_enabled = $1', [on]);
}

export const HeardIds = z.object({
  callSign: z.string().trim().min(3).max(20),
  snrDb: z.number().min(-50).max(100).default(0),
  ids: z.array(z.string().regex(/^[0-9a-f]{6}$/)).min(1).max(100),
});

/**
 * Short IDs a listener decoded: each matches the prayers this call sign sent by
 * packet in the last day whose fingerprint starts with it, then counts as heard.
 */
export async function heardIds(q: Queryable, r: z.infer<typeof HeardIds>, node: { id: string; name: string } | null = null): Promise<number> {
  const { rows } = await q.query<{ sent_hash: string }>(
    `select distinct sent_hash from public.radio_prayers
      where status = 'transmitted' and preset = 'aprs-1200' and upper(call_sign) = upper($1)
        and left(sent_hash, 6) = any($2::text[]) and transmitted_at > now() - interval '24 hours'`,
    [r.callSign, [...new Set(r.ids)]],
  );
  if (!rows.length) return 0;
  return receipts.heard(q, { callSign: r.callSign, preset: 'aprs-1200', snrDb: r.snrDb, hashes: rows.map((x) => x.sent_hash) }, node);
}
