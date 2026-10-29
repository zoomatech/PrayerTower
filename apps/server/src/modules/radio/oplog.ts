// Station operator log (docs/STATION_OPERATOR_GUIDE.md, "Operator log"), off
// until an admin turns on operator_log_enabled: one row per prayer the station
// sent or tried to send, with its time (UTC), the call sign, the station, the
// frequency, the preset and the exact text it was handed, as CSV from Admin → Radio.
import type { Queryable } from '../../db.js';

export async function enabled(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ on: boolean }>('select operator_log_enabled as on from public.token_settings');
  return rows[0]!.on;
}

export async function setEnabled(q: Queryable, on: boolean) {
  await q.query('update public.token_settings set operator_log_enabled = $1', [on]);
}

export interface LogRow {
  time_utc: string;
  call_sign: string | null;
  station: string;
  frequency_hz: number | null;
  preset: string;
  repeats: number;
  status: string;
  heard: boolean;
  error: string | null;
  contents: string;
  id: string;
}

/** Station transmissions between from and to (by when they went out, or were handed out for failures), oldest first; at most 10,000. */
export async function rows(q: Queryable, from: Date, to: Date): Promise<LogRow[]> {
  const { rows } = await q.query<LogRow>(
    `select to_char(coalesce(r.transmitted_at, r.claimed_at, r.created_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as time_utc,
            r.call_sign, coalesce(n.name, 'main') as station, r.frequency_hz::float8 as frequency_hz,
            coalesce(r.preset, 'psk31') as preset, r.repeats, r.status::text as status, r.heard_at is not null as heard,
            r.error, coalesce(r.sent_text, '') as contents, r.id
       from public.radio_prayers r left join public.radio_nodes n on n.id = r.claimed_by_node
      where r.transmitter = 'station' and r.status in ('transmitted', 'failed')
        and coalesce(r.transmitted_at, r.claimed_at, r.created_at) >= $1 and coalesce(r.transmitted_at, r.claimed_at, r.created_at) < $2
      order by coalesce(r.transmitted_at, r.claimed_at, r.created_at), r.id limit 10000`,
    [from, to],
  );
  return rows;
}

// A cell a spreadsheet would read as a formula gets a leading quote (OWASP, CSV injection).
const cell = (v: unknown) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const COLS = ['time_utc', 'call_sign', 'station', 'frequency_hz', 'preset', 'repeats', 'status', 'heard', 'error', 'contents', 'id'] as const;

export function toCsv(list: LogRow[]): string {
  return [COLS.join(','), ...list.map((r) => COLS.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}
