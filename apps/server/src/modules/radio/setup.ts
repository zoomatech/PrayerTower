// The station setup wizard (Admin → Radio; docs/STATION_OPERATOR_GUIDE.md,
// "Setup wizard"), off until an admin turns on radio_setup_wizard_enabled. It is
// for an operator's first setup: pick the radio (the wizard writes the settings
// lines for it), play a test tone to set audio levels, send a test burst, and
// see a listener decode it. A tone or burst is a radio_setup_tests row: the
// station picks it up (GET /station/setup-test), sends it and reports; a
// listener node or a listening phone reports the burst's fingerprint as it does
// for prayers, and that marks the test heard.
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import * as beacon from './beacon.js';
import * as operatorConsole from './console.js';
import { AppError, notFound } from '../../errors.js';

/**
 * Common radios and their Hamlib model numbers (`rigctl -l`). From Hamlib's
 * include/hamlib/riglist.h: a model is backend × 1000 + number (dummy 0, Yaesu 1,
 * Kenwood 2, Icom 3). `vox` and `ptt-only` need no CAT control.
 */
export const RIGS = [
  { id: 'vox', label: 'No rig control: the radio keys itself on sound (VOX)', model: null },
  { id: 'ptt-only', label: 'PTT only, by the interface (e.g. Digirig, keyed by RTS)', model: 1 },
  { id: 'ic-705', label: 'Icom IC-705', model: 3085 },
  { id: 'ic-7100', label: 'Icom IC-7100', model: 3070 },
  { id: 'ic-7300', label: 'Icom IC-7300', model: 3073 },
  { id: 'ic-7610', label: 'Icom IC-7610', model: 3078 },
  { id: 'ic-9700', label: 'Icom IC-9700', model: 3081 },
  { id: 'ft-817', label: 'Yaesu FT-817', model: 1020 },
  { id: 'ft-818', label: 'Yaesu FT-818', model: 1041 },
  { id: 'ft-857', label: 'Yaesu FT-857', model: 1022 },
  { id: 'ft-891', label: 'Yaesu FT-891', model: 1036 },
  { id: 'ft-897', label: 'Yaesu FT-897', model: 1023 },
  { id: 'ft-991', label: 'Yaesu FT-991 / FT-991A', model: 1035 },
  { id: 'ft-710', label: 'Yaesu FT-710', model: 1049 },
  { id: 'ftdx10', label: 'Yaesu FTDX10', model: 1042 },
  { id: 'ts-2000', label: 'Kenwood TS-2000', model: 2014 },
  { id: 'ts-590sg', label: 'Kenwood TS-590SG', model: 2037 },
  { id: 'ts-890s', label: 'Kenwood TS-890S', model: 2041 },
  { id: 'g90', label: 'Xiegu G90', model: 3088 },
  { id: 'other', label: 'Another radio (type its Hamlib number)', model: null },
] as const;

export const SetupChoice = z.object({
  rig: z.enum(RIGS.map((r) => r.id) as [string, ...string[]]).optional(),
  /** Only for rig 'other'. */
  model: z.number().int().min(1).max(99_999).optional(),
  /** The CAT (or PTT) serial port, e.g. /dev/serial/by-id/usb-... or /dev/cu.usbserial-1. */
  port: z.string().trim().max(200).regex(/^[A-Za-z0-9_./:+-]*$/, 'A port is a device path like /dev/ttyUSB0').optional(),
  speed: z.number().int().min(1200).max(115_200).optional(),
  band: z.enum(['fm', 'hf']).optional(),
  frequencyHz: z.number().int().min(100_000).max(10_000_000_000).optional(),
});
export type SetupChoice = z.infer<typeof SetupChoice>;

export async function enabled(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ on: boolean }>('select radio_setup_wizard_enabled as on from public.token_settings');
  return rows[0]?.on === true;
}

export async function setEnabled(q: Queryable, on: boolean) {
  await q.query('update public.token_settings set radio_setup_wizard_enabled = $1', [on]);
}

export async function choice(q: Queryable): Promise<SetupChoice> {
  const { rows } = await q.query<{ radio_setup: SetupChoice }>('select radio_setup from public.token_settings');
  return SetupChoice.parse(rows[0]?.radio_setup ?? {});
}

export async function setChoice(q: Queryable, patch: SetupChoice) {
  const next = { ...(await choice(q)), ...patch };
  await q.query('update public.token_settings set radio_setup = $1::jsonb', [JSON.stringify(next)]);
  return next;
}

/**
 * The settings lines for the choice: /etc/prayer-tower-rigctld.env (when the radio
 * is controlled through Hamlib) and /etc/prayer-tower-station.env.
 */
export function envFor(c: SetupChoice): { rigctld: string[]; station: string[] } {
  const rig = RIGS.find((r) => r.id === c.rig);
  const model = c.rig === 'other' ? c.model : rig?.model;
  const station = ['BURST_MODE=audio'];
  const rigctld: string[] = [];
  const port = c.port || '/dev/ttyUSB0';
  if (!rig || c.rig === 'vox') {
    // The radio's VOX keys on the burst audio; no PTT lines.
    station.push('RIG_CONTROL=off', 'BURST_PTT_ON_CMD=', 'BURST_PTT_OFF_CMD=');
  } else if (c.rig === 'ptt-only') {
    rigctld.push('RIG_MODEL=1', 'RIG_DEVICE=', 'RIG_SPEED=', `RIG_EXTRA_ARGS=-p ${port} -P RTS`);
    station.push('RIG_CONTROL=rigctld');
  } else if (model) {
    rigctld.push(`RIG_MODEL=${model}`, `RIG_DEVICE=${port}`, `RIG_SPEED=${c.speed ?? ''}`, 'RIG_EXTRA_ARGS=');
    station.push('RIG_CONTROL=rigctld');
  }
  const cat = rigctld.length > 0 && c.rig !== 'ptt-only';
  if (c.band === 'hf') {
    station.push('BURST_PRESET=hf-standard');
    if (cat) station.push('RIG_MODE=PKTUSB', 'RIG_PASSBAND_HZ=3000');
  } else {
    station.push('BURST_PRESET=fm-standard');
    if (cat) station.push('RIG_MODE=FM');
  }
  if (c.frequencyHz) station.push(cat ? `RIG_FREQ_HZ=${c.frequencyHz}` : `STATION_FREQ_HZ=${c.frequencyHz}`);
  return { rigctld, station };
}

export interface SetupTest {
  id: string;
  kind: 'tone' | 'burst';
  status: 'requested' | 'sending' | 'sent' | 'heard' | 'failed';
  seconds: number;
  code: string;
  call_sign: string | null;
  preset: string | null;
  peak_dbfs: number | null;
  heard_by: string | null;
  heard_snr_db: number | null;
  heard_peak_dbfs: number | null;
  error: string | null;
  created_at: string;
  sent_at: string | null;
  heard_at: string | null;
}

const COLS = `id, kind, status, seconds, code, call_sign, preset, peak_dbfs, heard_by, heard_snr_db, heard_peak_dbfs, error, created_at, sent_at, heard_at`;

/** A test the station has not picked up in this long is failed: the station is probably not running. */
export const PICKUP_MINUTES = 5;
/** A burst can be reported heard for this long after it went out. */
export const HEARD_MINUTES = 30;

/** Mark stale tests failed, so the wizard never waits forever. */
async function expire(q: Queryable) {
  await q.query(
    `update public.radio_setup_tests set status = 'failed',
            error = case when status = 'sent' then 'No listener reported hearing it' else 'The station did not pick the test up (is it running, in burst mode?)' end
      where (status in ('requested', 'sending') and created_at < now() - make_interval(mins => $1))
         or (status = 'sent' and sent_at < now() - make_interval(mins => $2))`,
    [PICKUP_MINUTES, HEARD_MINUTES],
  );
}

export async function recent(q: Queryable, limit = 5): Promise<SetupTest[]> {
  await expire(q);
  const { rows } = await q.query<SetupTest>(`select ${COLS} from public.radio_setup_tests order by created_at desc limit $1`, [limit]);
  return rows;
}

export async function request(q: Queryable, kind: SetupTest['kind'], userId: string, seconds = 10): Promise<SetupTest> {
  await expire(q);
  // One at a time: a second request while one is open would key the radio twice.
  const { rows: open } = await q.query(`select 1 from public.radio_setup_tests where status in ('requested', 'sending')`);
  if (open.length) throw new AppError(409, 'test_running', 'A test is already waiting for the station');
  const code = randomBytes(3).toString('hex').toUpperCase();
  const { rows } = await q.query<SetupTest>(
    `insert into public.radio_setup_tests (kind, seconds, code, requested_by) values ($1, $2, $3, $4) returning ${COLS}`,
    [kind, seconds, code, userId],
  );
  return rows[0]!;
}

/**
 * The station takes the oldest waiting test; null when none. Wizard tests only
 * while the wizard is on; reception beacons (beacon.ts) only while the beacon is
 * on and the station may transmit now (not held, inside the windows).
 */
export async function claim(q: Queryable, callSign: string | null): Promise<Pick<SetupTest, 'id' | 'kind' | 'seconds' | 'code'> | null> {
  const wizard = await enabled(q);
  const beacons = (await beacon.settings(q)).enabled && (await operatorConsole.mayTransmit(q));
  if (!wizard && !beacons) return null;
  await expire(q);
  const { rows } = await q.query<Pick<SetupTest, 'id' | 'kind' | 'seconds' | 'code'>>(
    `update public.radio_setup_tests set status = 'sending', call_sign = $1
      where id = (select id from public.radio_setup_tests
                   where status = 'requested' and (($2 and not beacon) or ($3 and beacon))
                   order by created_at limit 1 for update skip locked)
      returning id, kind, seconds, code`,
    [callSign?.toUpperCase() ?? null, wizard, beacons],
  );
  return rows[0] ?? null;
}

/** Whether listener reports should be matched against test bursts: the wizard or the beacon is on. */
export async function testsActive(q: Queryable): Promise<boolean> {
  return (await enabled(q)) || (await beacon.settings(q)).enabled;
}

export const SetupResult = z.object({
  ok: z.boolean(),
  callSign: z.string().trim().min(3).max(20),
  error: z.string().max(500).optional(),
  preset: z.string().trim().max(40).optional(),
  sentHash: z.string().regex(/^[0-9a-f]{32}$/).optional(),
  peakDbfs: z.number().min(-200).max(20).optional(),
});

export async function report(q: Queryable, id: string, r: z.infer<typeof SetupResult>) {
  const { rows } = await q.query<{ id: string }>(
    `update public.radio_setup_tests
        set status = case when $2 then 'sent' else 'failed' end, call_sign = upper($3), error = $4, preset = $5, sent_hash = $6,
            peak_dbfs = $7, sent_at = now()
      where id = $1 and status = 'sending' returning id`,
    [id, r.ok, r.callSign, r.ok ? null : (r.error ?? 'failed'), r.preset ?? null, r.sentHash ?? null, r.peakDbfs ?? null],
  );
  if (!rows[0]) throw notFound('Setup test');
}

/**
 * A listener decoded these fingerprints: any matching test burst sent in the
 * last HEARD_MINUTES is heard. Returns how many matched. Called by the same
 * routes that take prayer receipts, before them.
 */
export async function heard(q: Queryable, r: { callSign: string; snrDb: number; hashes: string[]; peakDbfs?: number }, by: string): Promise<number> {
  // A beacon keeps every receiver that heard it, not only the first.
  await q.query(
    `insert into public.radio_beacon_heard (test_id, heard_by, snr_db, peak_dbfs)
     select id, $3, $4, $5 from public.radio_setup_tests
      where beacon and status in ('sent', 'heard') and sent_hash = any($1::text[]) and upper(call_sign) = upper($2)
        and sent_at > now() - make_interval(mins => $6)
     on conflict (test_id, heard_by) do update set snr_db = greatest(radio_beacon_heard.snr_db, excluded.snr_db)`,
    [r.hashes, r.callSign, by.slice(0, 80), Math.round(r.snrDb * 10) / 10, r.peakDbfs ?? null, HEARD_MINUTES],
  );
  const { rowCount } = await q.query(
    `update public.radio_setup_tests set status = 'heard', heard_at = now(), heard_by = $3, heard_snr_db = $4, heard_peak_dbfs = $5
      where kind = 'burst' and status = 'sent' and sent_hash = any($1::text[]) and upper(call_sign) = upper($2)
        and sent_at > now() - make_interval(mins => $6)`,
    [r.hashes, r.callSign, by.slice(0, 80), Math.round(r.snrDb * 10) / 10, r.peakDbfs ?? null, HEARD_MINUTES],
  );
  return rowCount ?? 0;
}

/** The operator decoded it on something that does not report (fldigi, a recording): confirm by hand. */
export async function confirm(q: Queryable, id: string) {
  const { rows } = await q.query<SetupTest>(
    `update public.radio_setup_tests set status = 'heard', heard_at = now(), heard_by = 'Confirmed by the operator'
      where id = $1 and kind = 'burst' and status in ('sent', 'failed') and sent_at is not null returning ${COLS}`,
    [id],
  );
  if (!rows[0]) throw notFound('Sent test burst');
  return rows[0];
}

/** What a receiver's level means for the wizard: too quiet, good, or clipping. */
export function levelAdvice(peakDbfs: number | null): 'quiet' | 'good' | 'hot' | null {
  if (peakDbfs === null) return null;
  if (peakDbfs > -1) return 'hot';
  if (peakDbfs < -30) return 'quiet';
  return 'good';
}

/** Admin → Radio → Setup wizard: the choice, its settings lines, the station's own checks and the latest tests. */
export async function overview(q: Queryable) {
  const c = await choice(q);
  const { rows: checks } = await q.query<{ call_sign: string; checks: { name: string; ok: boolean; detail: string }[]; reported_at: string }>(
    `select call_sign, checks, reported_at from public.station_status order by reported_at desc limit 3`,
  );
  const tests = (await recent(q)).map((t) => ({ ...t, advice: levelAdvice(t.heard_peak_dbfs) }));
  return { enabled: await enabled(q), choice: c, rigs: RIGS, env: envFor(c), checks, tests };
}
