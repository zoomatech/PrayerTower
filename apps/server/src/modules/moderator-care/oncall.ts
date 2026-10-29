// The moderator on-call rota (docs/HARMFUL_PRAYERS.md, "On-call rota"), off by default.
// Weekly shifts say who is on call. A held or crisis item that has waited part of the
// limit reminds whoever is on call (every moderator when nobody is); one that passes
// the limit goes to an admin (or the person named in the settings). Shifts leave notes
// for the next shift.
import type { Task } from 'graphile-worker';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, notFound } from '../../errors.js';
import * as notifications from '../notifications/index.js';

export interface OncallSettings {
  enabled: boolean;
  max_wait_minutes: number;
  remind_at_percent: number;
  timezone: string;
  escalate_to: string | null;
}
const COLUMNS = ['enabled', 'max_wait_minutes', 'remind_at_percent', 'timezone', 'escalate_to'] as const satisfies readonly (keyof OncallSettings)[];

export async function settings(q: Queryable): Promise<OncallSettings> {
  const { rows } = await q.query<OncallSettings>(`select ${COLUMNS.join(', ')} from public.oncall_settings`);
  return rows[0]!;
}

const validZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const SettingsPatch = z
  .object({
    enabled: z.boolean(),
    max_wait_minutes: z.number().int().min(5).max(1440),
    remind_at_percent: z.number().int().min(10).max(100),
    timezone: z.string().trim().min(1).max(64).refine(validZone, 'Unknown time zone'),
    escalate_to: z.uuid().nullable(),
  })
  .partial();

export async function updateSettings(q: Queryable, patch: z.infer<typeof SettingsPatch>): Promise<OncallSettings> {
  if (patch.escalate_to && !(await isStaff(q, patch.escalate_to))) throw badRequest('That person is not a moderator or admin');
  // escalate_to may be set back to empty, so it is set only when the patch names it.
  const sets = COLUMNS.filter((c) => c !== 'escalate_to').map((c, i) => `${c} = coalesce($${i + 1}, ${c})`);
  const params: unknown[] = COLUMNS.filter((c) => c !== 'escalate_to').map((c) => patch[c] ?? null);
  if ('escalate_to' in patch) {
    params.push(patch.escalate_to ?? null);
    sets.push(`escalate_to = $${params.length}`);
  }
  const { rows } = await q.query<OncallSettings>(`update public.oncall_settings set ${sets.join(', ')}, updated_at = now() returning ${COLUMNS.join(', ')}`, params);
  return rows[0]!;
}

async function isStaff(q: Queryable, userId: string) {
  const { rowCount } = await q.query(`select 1 from public.user_roles where user_id = $1 and role in ('moderator', 'admin')`, [userId]);
  return !!rowCount;
}

/** Everyone who can be put on call or named for escalations. */
export async function people(q: Queryable) {
  const { rows } = await q.query<{ id: string; display_name: string }>(
    `select distinct p.id, p.display_name from public.user_roles r join public.profiles p on p.id = r.user_id
      where r.role in ('moderator', 'admin') order by p.display_name limit 200`,
  );
  return rows;
}

export const Shift = z.object({
  userId: z.uuid(),
  weekday: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
});

export interface ShiftRow {
  id: string;
  user_id: string;
  display_name: string;
  weekday: number;
  start_minute: number;
  end_minute: number;
}

export async function shifts(q: Queryable): Promise<ShiftRow[]> {
  const { rows } = await q.query<ShiftRow>(
    `select s.id, s.user_id, p.display_name, s.weekday, s.start_minute, s.end_minute
       from public.oncall_shifts s join public.profiles p on p.id = s.user_id
      order by s.weekday, s.start_minute, p.display_name`,
  );
  return rows;
}

export async function addShift(q: Queryable, adminId: string, input: z.infer<typeof Shift>) {
  if (input.endMinute <= input.startMinute) throw badRequest('A shift must end after it starts');
  if (!(await isStaff(q, input.userId))) throw badRequest('That person is not a moderator or admin');
  const { rows } = await q.query<{ id: string }>(
    `insert into public.oncall_shifts (user_id, weekday, start_minute, end_minute, created_by) values ($1, $2, $3, $4, $5) returning id`,
    [input.userId, input.weekday, input.startMinute, input.endMinute, adminId],
  );
  return rows[0]!;
}

export async function removeShift(q: Queryable, id: string) {
  const { rowCount } = await q.query('delete from public.oncall_shifts where id = $1', [id]);
  if (!rowCount) throw notFound('Shift');
}

/** Who is on call at this moment, in the rota's time zone. */
export async function onCallNow(q: Queryable, at: Date = new Date()) {
  const { rows } = await q.query<{ user_id: string; display_name: string; end_minute: number }>(
    `with s as (select timezone from public.oncall_settings), t as (select ($1::timestamptz at time zone s.timezone) as local from s)
     select distinct on (o.user_id) o.user_id, p.display_name, o.end_minute
       from public.oncall_shifts o join public.profiles p on p.id = o.user_id, t
      where o.weekday = extract(dow from t.local)
        and extract(hour from t.local) * 60 + extract(minute from t.local) >= o.start_minute
        and extract(hour from t.local) * 60 + extract(minute from t.local) < o.end_minute
      order by o.user_id, o.end_minute desc`,
    [at],
  );
  return rows;
}

export const Note = z.object({ body: z.string().trim().min(1).max(2000) });

export async function addNote(q: Queryable, authorId: string, body: string) {
  const { rows } = await q.query<{ id: string }>('insert into public.oncall_notes (author_id, body) values ($1, $2) returning id', [authorId, body]);
  return rows[0]!;
}

export async function notes(q: Queryable, limit = 10) {
  const { rows } = await q.query<{ id: string; author_name: string | null; body: string; created_at: Date }>(
    `select n.id, p.display_name as author_name, n.body, n.created_at
       from public.oncall_notes n left join public.profiles p on p.id = n.author_id
      order by n.created_at desc limit $1`,
    [limit],
  );
  return rows;
}

/** Items a person must see soon: held (hidden until decided), harmful-prayer or crisis items still pending. */
const WAITING = `m.status = 'pending' and (m.auto_hidden or m.source in ('harm', 'crisis'))`;

/** How the rota stands: who is on call, what is waiting, and the oldest wait. */
export async function status(q: Queryable) {
  const s = await settings(q);
  const { rows } = await q.query<{ waiting: number; oldest_minutes: number | null; over: number }>(
    `select count(*)::int as waiting,
            floor(extract(epoch from now() - min(m.created_at)) / 60)::int as oldest_minutes,
            count(*) filter (where m.created_at < now() - make_interval(mins => $1))::int as over
       from public.moderation_items m where ${WAITING}`,
    [s.max_wait_minutes],
  );
  return { settings: s, onCall: await onCallNow(q), ...rows[0]!, notes: await notes(q, 5) };
}

async function staff(q: Queryable, role: 'admin' | 'moderator') {
  const { rows } = await q.query<{ user_id: string }>(
    role === 'admin'
      ? `select distinct user_id from public.user_roles where role = 'admin'`
      : `select distinct user_id from public.user_roles where role in ('moderator', 'admin')`,
  );
  return rows.map((r) => r.user_id);
}

/**
 * One pass of the rota check (every five minutes): remind whoever is on call about
 * items past the reminder point, and escalate items past the limit. Each item is
 * reminded and escalated once. Notices say how long, never what the post says.
 */
export async function check(q: Queryable, at: Date = new Date()) {
  const s = await settings(q);
  if (!s.enabled) return { reminded: 0, escalated: 0 };
  const remindAfter = Math.max(1, Math.round((s.max_wait_minutes * s.remind_at_percent) / 100));

  const { rows: remind } = await q.query<{ id: string; user_id: string; minutes: number }>(
    `update public.moderation_items m set oncall_reminded_at = $2
      where ${WAITING} and m.oncall_reminded_at is null and m.created_at < $2::timestamptz - make_interval(mins => $1)
      returning m.id, m.user_id, floor(extract(epoch from $2::timestamptz - m.created_at) / 60)::int as minutes`,
    [remindAfter, at],
  );
  let reminded = 0;
  if (remind.length) {
    const onCall = (await onCallNow(q, at)).map((o) => o.user_id);
    const to = onCall.length ? onCall : await staff(q, 'moderator');
    for (const userId of to) {
      // Nobody is reminded about their own post.
      const mine = remind.filter((r) => r.user_id !== userId);
      if (!mine.length) continue;
      const oldest = Math.max(...mine.map((r) => r.minutes));
      await notifications.notify(q, userId, {
        kind: 'oncall_reminder',
        title: mine.length === 1 ? 'A held post is waiting' : `${mine.length} held posts are waiting`,
        body: `The oldest has waited ${oldest} minutes. Please look at the moderation queue before ${s.max_wait_minutes} minutes pass.`,
        data: { itemIds: mine.map((r) => r.id) },
        dedupeKey: `oncall_reminder:${mine[0]!.id}:${userId}`,
      });
      reminded++;
    }
  }

  const { rows: late } = await q.query<{ id: string; user_id: string; minutes: number }>(
    `update public.moderation_items m set oncall_escalated_at = $2
      where ${WAITING} and m.oncall_escalated_at is null and m.created_at < $2::timestamptz - make_interval(mins => $1)
      returning m.id, m.user_id, floor(extract(epoch from $2::timestamptz - m.created_at) / 60)::int as minutes`,
    [s.max_wait_minutes, at],
  );
  let escalated = 0;
  if (late.length) {
    const to = s.escalate_to ? [s.escalate_to] : await staff(q, 'admin');
    for (const userId of to) {
      const mine = late.filter((r) => r.user_id !== userId);
      if (!mine.length) continue;
      await notifications.notify(q, userId, {
        kind: 'oncall_escalation',
        title: mine.length === 1 ? 'A held post has waited too long' : `${mine.length} held posts have waited too long`,
        body: `No moderator has decided ${mine.length === 1 ? 'it' : 'them'} within ${s.max_wait_minutes} minutes (oldest: ${Math.max(...mine.map((r) => r.minutes))} minutes). Open the moderation queue.`,
        data: { itemIds: mine.map((r) => r.id) },
        dedupeKey: `oncall_escalation:${mine[0]!.id}:${userId}`,
      });
      escalated++;
    }
  }
  return { reminded, escalated };
}

export const oncallCheckTask =
  (q: Queryable): Task =>
  async () => {
    await check(q);
  };
