// Listener acknowledgements (docs/STATION_OPERATOR_GUIDE.md, "Listener
// acknowledgements"), off until an admin turns on radio_heard_ack_enabled.
// A prayer counts as heard on the air only once a listener decodes it
// (radio_prayers.heard_at, set by receipts.heard from a listener node or the
// /listen page). One the station sent that nobody heard within
// radio_heard_timeout_minutes goes back in the queue, up to
// radio_heard_max_retries times, and the station sends it again. Retries only
// happen while an enabled listener node has checked in within the last
// LISTENER_ALIVE_MINUTES: with no listener running, nothing could have heard it.
import type { Queryable } from '../../db.js';

export const LISTENER_ALIVE_MINUTES = 5;

export interface AckSettings {
  enabled: boolean;
  timeoutMinutes: number;
  maxRetries: number;
}

export async function settings(q: Queryable): Promise<AckSettings> {
  const { rows } = await q.query<AckSettings>(
    `select radio_heard_ack_enabled as enabled, radio_heard_timeout_minutes as "timeoutMinutes", radio_heard_max_retries as "maxRetries" from public.token_settings`,
  );
  return rows[0]!;
}

export async function updateSettings(q: Queryable, patch: Partial<AckSettings>): Promise<AckSettings> {
  await q.query(
    `update public.token_settings set radio_heard_ack_enabled = coalesce($1, radio_heard_ack_enabled),
            radio_heard_timeout_minutes = coalesce($2, radio_heard_timeout_minutes),
            radio_heard_max_retries = coalesce($3, radio_heard_max_retries)`,
    [patch.enabled ?? null, patch.timeoutMinutes ?? null, patch.maxRetries ?? null],
  );
  return settings(q);
}

/**
 * Put back in the queue every prayer the station sent that no listener heard in
 * time and that has retries left. Runs before each claim (radio/index.ts). Returns how many.
 */
export async function requeueUnheard(q: Queryable): Promise<number> {
  const s = await settings(q);
  if (!s.enabled) return 0;
  const { rowCount } = await q.query(
    `update public.radio_prayers r
        set status = 'queued', claimed_at = null, claimed_by_node = null, transmitted_at = null, heard_retries = r.heard_retries + 1
      where r.status = 'transmitted' and r.transmitter = 'station' and r.heard_at is null
        and r.heard_retries < $2 and r.transmitted_at < now() - make_interval(mins => $1)
        and exists (select 1 from public.radio_nodes n
                     where n.role = 'listener' and n.enabled and n.last_seen_at > now() - make_interval(mins => $3))`,
    [s.timeoutMinutes, s.maxRetries, LISTENER_ALIVE_MINUTES],
  );
  return rowCount ?? 0;
}

/** Last 24 hours of station sends: heard, waiting for a listener, and given up on (no retries left). */
export async function stats(q: Queryable) {
  const { rows } = await q.query<{ heard: number; waiting: number; unheard: number; retried: number }>(
    `select count(*) filter (where heard_at is not null)::int as heard,
            count(*) filter (where heard_at is null and heard_retries < s.radio_heard_max_retries)::int as waiting,
            count(*) filter (where heard_at is null and heard_retries >= s.radio_heard_max_retries)::int as unheard,
            count(*) filter (where heard_retries > 0)::int as retried
       from public.radio_prayers r, public.token_settings s
      where r.status = 'transmitted' and r.transmitter = 'station' and r.transmitted_at > now() - interval '24 hours'`,
  );
  return rows[0]!;
}
