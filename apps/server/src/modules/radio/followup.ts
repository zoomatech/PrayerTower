// Closing the loop (docs/STATION_OPERATOR_GUIDE.md, "Sent by radio"), off until an admin
// turns on radio_followup_enabled. The member who sent a radio prayer, and the person who
// asked, see on the request when it last went out and how many listeners heard it, with a
// small map of the listener nodes that heard it (only nodes placed on the coverage map,
// rounded to about a city; phones are only counted, never placed). A member who opts in
// gets one gentle notice per send, half an hour after it went out, when the reports are in.
import type { Task } from 'graphile-worker';
import type { Queryable } from '../../db.js';
import { notFound } from '../../errors.js';
import * as notifications from '../notifications/index.js';
import * as coverage from './coverage.js';
import { timeFor } from './receipts.js';

/** Reports that come in later than this still count on the request; the notice waits this long. */
export const NOTICE_AFTER_MINUTES = 30;

export async function enabled(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ on: boolean }>('select radio_followup_enabled as on from public.token_settings');
  return rows[0]!.on;
}

export async function optedIn(q: Queryable, userId: string): Promise<boolean> {
  const { rows } = await q.query<{ on: boolean }>('select radio_followup_opt_in as on from public.profiles where id = $1', [userId]);
  return rows[0]?.on === true;
}

export interface HeardPlace {
  name: string;
  lat: number;
  lon: number;
  snrDb: number;
}

export interface RadioSummary {
  /** The member's own choice: one notice per send. */
  optedIn: boolean;
  /** The latest send, or null when it hasn't gone out yet. */
  latest: { sentAt: string; callSign: string | null; heardBy: number; places: HeardPlace[] } | null;
  /** Times it went out in all. */
  sends: number;
  /** The station's dot on the map, while the coverage map is on. */
  station: { lat: number; lon: number } | null;
}

/** Listeners that heard one radio prayer: the trail's nodes (each once) and phones, or the receipt count when the trail kept none. */
const HEARD_BY = `coalesce(nullif((select count(*)::int from public.radio_prayer_heard h where h.radio_prayer_id = r.id), 0), r.heard_count)`;

/** For the member who sent it or the person who asked; 404 to anyone else. */
export async function forPost(q: Queryable, viewerId: string, postId: string): Promise<RadioSummary> {
  if (!(await enabled(q))) throw notFound('Sent by radio');
  const { rows } = await q.query<{ id: string; sent_at: Date; call_sign: string | null; heard_by: number; sends: number }>(
    `select r.id, r.transmitted_at as sent_at, r.call_sign, ${HEARD_BY} as heard_by, count(*) over ()::int as sends
       from public.radio_prayers r join public.posts p on p.id = r.post_id
      where r.post_id = $2 and r.status = 'transmitted' and r.kind <> 'ceaseless' and (r.user_id = $1 or p.user_id = $1)
      order by r.transmitted_at desc limit 1`,
    [viewerId, postId],
  );
  const map = await coverage.settings(q);
  const r = rows[0];
  let places: HeardPlace[] = [];
  if (r && map.enabled) {
    const { rows: hs } = await q.query<{ name: string; lat: string; lon: string; snr: number }>(
      `select n.name, n.lat, n.lon, max(h.snr_db)::float8 as snr from public.radio_prayer_heard h join public.radio_nodes n on n.id = h.node_id
        where h.radio_prayer_id = $1 and n.lat is not null and n.lon is not null group by n.id order by n.name`,
      [r.id],
    );
    places = hs.map((h) => ({ name: h.name, lat: Number(h.lat), lon: Number(h.lon), snrDb: Math.round(h.snr * 10) / 10 }));
  }
  return {
    optedIn: await optedIn(q, viewerId),
    latest: r ? { sentAt: r.sent_at.toISOString(), callSign: r.call_sign, heardBy: r.heard_by, places } : null,
    sends: r?.sends ?? 0,
    station: map.enabled ? map.station : null,
  };
}

/** "Sent at 9:30 PM CDT, heard by 4 listeners." */
export function noticeBody(time: string, heardBy: number): string {
  if (heardBy === 0) return `Sent at ${time}. No listener has reported it yet.`;
  return `Sent at ${time}, heard by ${heardBy} ${heardBy === 1 ? 'listener' : 'listeners'}.`;
}

/**
 * One notice per send to the sender and the asker who opted in, half an hour after it went
 * out, so the listeners' reports are in. Sends from the last day only; each send once.
 */
export async function sendDue(q: Queryable): Promise<number> {
  if (!(await enabled(q))) return 0;
  const { rows } = await q.query<{ id: string; post_id: string; user_id: string; poster_id: string; transmitted_at: Date; heard_by: number; kind: string }>(
    `update public.radio_prayers r set followup_sent_at = now()
       from public.posts p
      where p.id = r.post_id and r.status = 'transmitted' and r.followup_sent_at is null and r.kind <> 'ceaseless'
        and r.transmitted_at < now() - make_interval(mins => $1) and r.transmitted_at > now() - interval '24 hours'
      returning r.id, r.post_id, r.user_id, p.user_id as poster_id, r.transmitted_at, ${HEARD_BY} as heard_by, r.kind`,
    [NOTICE_AFTER_MINUTES],
  );
  let sent = 0;
  for (const r of rows) {
    for (const userId of new Set([r.user_id, r.poster_id])) {
      if (!(await optedIn(q, userId))) continue;
      const asker = userId === r.poster_id && (userId !== r.user_id || r.kind === 'auto');
      await notifications.notify(q, userId, {
        kind: 'radio_followup',
        title: asker ? 'Your request went out by radio' : 'Your prayer went out by radio',
        body: noticeBody(await timeFor(q, userId, r.transmitted_at), r.heard_by),
        data: { postId: r.post_id, radioPrayerId: r.id },
        dedupeKey: `radio_followup:${r.id}:${userId}`,
      });
      sent++;
    }
  }
  return sent;
}

export function followupTask(q: Queryable): Task {
  return async (_payload, helpers) => {
    const n = await sendDue(q);
    if (n) helpers.logger.info(`radio follow-ups: ${n} sent`);
  };
}

/** Admin → Radio → Members and listeners: these three switches together. */
export async function loopSettings(q: Queryable) {
  const { rows } = await q.query<{ followup: boolean; readAloud: boolean; namePrivacy: boolean }>(
    `select radio_followup_enabled as followup, radio_read_aloud_enabled as "readAloud", radio_name_privacy_enabled as "namePrivacy" from public.token_settings`,
  );
  return rows[0]!;
}

export async function updateLoopSettings(q: Queryable, p: { followup?: boolean; readAloud?: boolean; namePrivacy?: boolean }) {
  await q.query(
    `update public.token_settings set radio_followup_enabled = coalesce($1, radio_followup_enabled), radio_read_aloud_enabled = coalesce($2, radio_read_aloud_enabled),
            radio_name_privacy_enabled = coalesce($3, radio_name_privacy_enabled)`,
    [p.followup ?? null, p.readAloud ?? null, p.namePrivacy ?? null],
  );
  return loopSettings(q);
}

/** The member's own radio choices, each shown only while its switch is on. */
export async function prefs(q: Queryable, userId: string) {
  const s = await loopSettings(q);
  const { rows } = await q.query<{ followup: boolean; names: boolean }>(
    'select radio_followup_opt_in as followup, radio_names_private as names from public.profiles where id = $1',
    [userId],
  );
  return { followup: s.followup ? rows[0]!.followup : null, namesPrivate: s.namePrivacy ? rows[0]!.names : null };
}

export async function setPrefs(q: Queryable, userId: string, p: { followup?: boolean; namesPrivate?: boolean }) {
  await q.query(
    `update public.profiles set radio_followup_opt_in = coalesce($2, radio_followup_opt_in), radio_names_private = coalesce($3, radio_names_private) where id = $1`,
    [userId, p.followup ?? null, p.namesPrivate ?? null],
  );
  return prefs(q, userId);
}
