// Urgent prayer mode (docs/STATION_OPERATOR_GUIDE.md, "Urgent prayers"), off until an admin
// turns on urgent_radio_enabled. An admin or radio operator flags a request as urgent: it goes
// first in the queue, so it leaves in the next transmit window, said `repeats` times, on the
// robust preset (hf-robust on an HF band, fm-robust-fec otherwise, unless an admin picks one).
// A burst of urgent prayers carries nothing else. When a listener decodes it, it is confirmed and
// whoever flagged it is told; one that no listener confirms within confirm_minutes goes out
// again, up to max_retries times, while a listener node is running.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, notFound } from '../../errors.js';
import * as notifications from '../notifications/index.js';
import { LISTENER_ALIVE_MINUTES } from './acks.js';
import * as bandPlan from './band-plan.js';
import * as schedule from './schedule.js';

export interface UrgentSettings {
  enabled: boolean;
  repeats: number;
  /** A burst preset, or "auto": the robust one for the band. */
  preset: string;
  confirmMinutes: number;
  maxRetries: number;
}

export const SettingsPatch = z.object({
  enabled: z.boolean().optional(),
  repeats: z.number().int().min(1).max(10).optional(),
  preset: z.string().trim().regex(/^[a-z0-9-]{3,40}$/).optional(),
  confirmMinutes: z.number().int().min(2).max(240).optional(),
  maxRetries: z.number().int().min(0).max(5).optional(),
});

export async function settings(q: Queryable): Promise<UrgentSettings> {
  const { rows } = await q.query<UrgentSettings>(
    `select urgent_radio_enabled as enabled, urgent_radio_repeats as repeats, urgent_radio_preset as preset,
            urgent_radio_confirm_minutes as "confirmMinutes", urgent_radio_max_retries as "maxRetries" from public.token_settings`,
  );
  return rows[0]!;
}

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  await q.query(
    `update public.token_settings set urgent_radio_enabled = coalesce($1, urgent_radio_enabled), urgent_radio_repeats = coalesce($2, urgent_radio_repeats),
            urgent_radio_preset = coalesce($3, urgent_radio_preset), urgent_radio_confirm_minutes = coalesce($4, urgent_radio_confirm_minutes),
            urgent_radio_max_retries = coalesce($5, urgent_radio_max_retries)`,
    [p.enabled ?? null, p.repeats ?? null, p.preset ?? null, p.confirmMinutes ?? null, p.maxRetries ?? null],
  );
  return settings(q);
}

/** The preset an urgent burst goes out on now. */
export async function presetNow(q: Queryable, s?: UrgentSettings, now = new Date()): Promise<string> {
  const { preset } = s ?? (await settings(q));
  if (preset !== 'auto') return preset;
  const band = await bandPlan.current(q, now);
  return band && bandPlan.isHf(band.band) ? 'hf-robust' : 'fm-robust-fec';
}

/**
 * Flag a request as urgent: its waiting radio prayer moves to the front with the urgent repeats,
 * or, when it has none waiting, a new free one is queued. Only a request that could go on the
 * air anyway: visible, not sensitive, nothing harmful, nothing waiting for a moderator.
 */
export async function flag(q: Queryable, staffId: string, postId: string, now = new Date()) {
  const s = await settings(q);
  if (!s.enabled) throw notFound('Urgent prayers');
  const { rows: posts } = await q.query<{ ok: boolean }>(
    `select (p.post_type = 'prayer_request' and p.moderation_status = 'visible' and not p.is_sensitive and not (p.is_lament and not p.lament_radio)
             and p.harm_category is null
             and not exists (select 1 from public.moderation_items m where m.target_type = 'post' and m.target_id = p.id and m.status = 'pending')) as ok
       from public.posts p where p.id = $1`,
    [postId],
  );
  if (!posts[0]) throw notFound('Request');
  if (!posts[0].ok) throw badRequest('This request can’t go on the air (it is private, sensitive, or waiting for a moderator)');
  const { rows: waiting } = await q.query<{ id: string }>(
    `update public.radio_prayers set urgent = true, urgent_flagged_by = $2, urgent_flagged_at = $3, repeats = greatest(repeats, $4)
      where id = (select id from public.radio_prayers where post_id = $1 and status = 'queued' order by created_at limit 1)
      returning id`,
    [postId, staffId, now, s.repeats],
  );
  let id = waiting[0]?.id;
  if (!id) {
    const { rows } = await q.query<{ id: string }>(
      `insert into public.radio_prayers (post_id, user_id, cost, idempotency_key, repeats, funded_by, kind, urgent, urgent_flagged_by, urgent_flagged_at)
       select p.id, p.user_id, 0, 'urgent:' || p.id || ':' || $4, $2, 'free', 'prayer', true, $3, $5 from public.posts p where p.id = $1
       returning id`,
      [postId, s.repeats, staffId, now.getTime(), now],
    );
    id = rows[0]!.id;
  }
  return { id, nextWindowAt: schedule.nextOpening(await schedule.get(q), now)?.toISOString() ?? null };
}

/** Take the flag off a waiting one: it keeps its place in the ordinary queue. */
export async function unflag(q: Queryable, id: string) {
  const { rowCount } = await q.query(`update public.radio_prayers set urgent = false where id = $1 and urgent and status = 'queued'`, [id]);
  if (!rowCount) throw notFound('Waiting urgent prayer');
}

export interface UrgentPrayer {
  id: string;
  postId: string;
  text: string;
  status: string;
  repeats: number;
  flaggedAt: string;
  transmittedAt: string | null;
  confirmedAt: string | null;
  heardCount: number;
  retries: number;
}

/** The last two days of urgent prayers, newest first, and when the next window opens. */
export async function list(q: Queryable, now = new Date()) {
  const s = await settings(q);
  const { rows } = await q.query(
    `select r.id, r.post_id, left(p.body, 140) as text, r.status, r.repeats, r.urgent_flagged_at, r.transmitted_at, r.urgent_confirmed_at, r.heard_count, r.urgent_retries
       from public.radio_prayers r join public.posts p on p.id = r.post_id
      where r.urgent and r.urgent_flagged_at > $1 order by r.urgent_flagged_at desc limit 50`,
    [new Date(now.getTime() - 48 * 3_600_000)],
  );
  const prayers: UrgentPrayer[] = rows.map((r) => ({
    id: r.id, postId: r.post_id, text: r.text, status: r.status, repeats: r.repeats, flaggedAt: r.urgent_flagged_at.toISOString(),
    transmittedAt: r.transmitted_at?.toISOString() ?? null, confirmedAt: r.urgent_confirmed_at?.toISOString() ?? null, heardCount: r.heard_count, retries: r.urgent_retries,
  }));
  return {
    ...s,
    presetNow: s.enabled ? await presetNow(q, s, now) : null,
    nextWindowAt: s.enabled ? (schedule.nextOpening(await schedule.get(q), now)?.toISOString() ?? null) : null,
    prayers,
  };
}

/** A listener heard these radio prayers (receipts.heard): confirm the urgent ones and tell whoever flagged them, once. */
export async function confirmHeard(q: Queryable, radioPrayerIds: string[], now = new Date()) {
  if (!radioPrayerIds.length) return 0;
  const { rows } = await q.query<{ id: string; post_id: string; urgent_flagged_by: string | null }>(
    `update public.radio_prayers set urgent_confirmed_at = $2 where id = any($1::uuid[]) and urgent and urgent_confirmed_at is null
     returning id, post_id, urgent_flagged_by`,
    [radioPrayerIds, now],
  );
  for (const r of rows) {
    if (!r.urgent_flagged_by) continue;
    await notifications.notify(q, r.urgent_flagged_by, {
      kind: 'radio_urgent_confirmed',
      title: 'A listener confirmed the urgent request',
      body: 'It went out and was decoded on the air.',
      data: { postId: r.post_id, radioPrayerId: r.id },
      dedupeKey: `radio_urgent_confirmed:${r.id}`,
    });
  }
  return rows.length;
}

/** Urgent prayers no listener confirmed in time go out again, while a listener node is running. */
export async function requeueUnconfirmed(q: Queryable): Promise<number> {
  const s = await settings(q);
  if (!s.enabled) return 0;
  const { rowCount } = await q.query(
    `update public.radio_prayers r
        set status = 'queued', claimed_at = null, claimed_by_node = null, transmitted_at = null, urgent_retries = r.urgent_retries + 1
      where r.urgent and r.status = 'transmitted' and r.urgent_confirmed_at is null
        and r.urgent_retries < $2 and r.transmitted_at < now() - make_interval(mins => $1)
        and exists (select 1 from public.radio_nodes n
                     where n.role = 'listener' and n.enabled and n.last_seen_at > now() - make_interval(mins => $3))`,
    [s.confirmMinutes, s.maxRetries, LISTENER_ALIVE_MINUTES],
  );
  return rowCount ?? 0;
}
