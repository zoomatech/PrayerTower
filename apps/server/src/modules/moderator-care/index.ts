// Looking after moderators (docs/HARMFUL_PRAYERS.md, "For moderators"), off by default:
// hard items blurred until tapped, a break offered after a stretch of reviewing, and
// an item handed to another moderator with a note so nobody decides a hard case alone.
// The break is an offer, never a lock: moderators choose (Steiger et al. 2021; arxiv.org/abs/2509.07187).
import { z } from 'zod';
import type { Task } from 'graphile-worker';
import type { Queryable } from '../../db.js';
import { badRequest, conflict, forbidden, notFound } from '../../errors.js';
import * as notifications from '../notifications/index.js';

export interface CareSettings {
  enabled: boolean;
  /** Admin → Moderation dashboard. */
  dashboard_enabled: boolean;
  /** Monday report to admins of what the harmful-prayer check flagged and how moderators decided. */
  weekly_report_enabled: boolean;
  blur_hard: boolean;
  break_after_minutes: number;
  break_after_hard_items: number;
  break_minutes: number;
}
const COLUMNS = ['enabled', 'dashboard_enabled', 'weekly_report_enabled', 'blur_hard', 'break_after_minutes', 'break_after_hard_items', 'break_minutes'] as const satisfies readonly (keyof CareSettings)[];

export async function settings(q: Queryable): Promise<CareSettings> {
  const { rows } = await q.query<CareSettings>(`select ${COLUMNS.join(', ')} from public.moderator_care_settings`);
  return rows[0]!;
}

export const SettingsPatch = z
  .object({
    enabled: z.boolean(),
    dashboard_enabled: z.boolean(),
    weekly_report_enabled: z.boolean(),
    blur_hard: z.boolean(),
    break_after_minutes: z.number().int().min(0).max(600),
    break_after_hard_items: z.number().int().min(0).max(1000),
    break_minutes: z.number().int().min(1).max(120),
  })
  .partial();

export async function updateSettings(q: Queryable, patch: z.infer<typeof SettingsPatch>): Promise<CareSettings> {
  const sets = COLUMNS.map((c, i) => `${c} = coalesce($${i + 1}, ${c})`).join(', ');
  const { rows } = await q.query<CareSettings>(`update public.moderator_care_settings set ${sets}, updated_at = now() returning ${COLUMNS.join(', ')}`, [
    ...COLUMNS.map((c) => patch[c] ?? null),
  ]);
  return rows[0]!;
}

/** The other people who can take an item: moderators and admins, but not the asker. */
export async function colleagues(q: Queryable, userId: string) {
  const { rows } = await q.query<{ id: string; display_name: string }>(
    `select distinct p.id, p.display_name from public.user_roles r join public.profiles p on p.id = r.user_id
      where r.role in ('moderator', 'admin') and p.id <> $1 order by p.display_name limit 100`,
    [userId],
  );
  return rows;
}

export const Handoff = z.object({ toUserId: z.uuid().optional(), note: z.string().trim().max(500).optional() });

/**
 * Pass an item to a named moderator, or to "anyone else" (no name). It leaves the
 * passer's queue and goes to the top of the named moderator's. They hear about it,
 * without the content.
 */
export async function handoff(q: Queryable, moderatorId: string, itemId: string, input: z.infer<typeof Handoff>) {
  const s = await settings(q);
  if (!s.enabled) throw forbidden('Handing items to another moderator is switched off (Admin → Moderator care)');
  const { rows } = await q.query<{ status: string; user_id: string }>('select status, user_id from public.moderation_items where id = $1 for update', [itemId]);
  const item = rows[0];
  if (!item) throw notFound('Moderation item');
  if (item.status !== 'pending') throw conflict('This item was already decided');
  if (input.toUserId) {
    if (input.toUserId === moderatorId) throw badRequest('Pick someone else');
    if (input.toUserId === item.user_id) throw badRequest("A moderator can't decide about their own post");
    if (!(await colleagues(q, moderatorId)).some((c) => c.id === input.toUserId)) throw badRequest('That person is not a moderator');
  }
  await q.query(
    `update public.moderation_items set handoff_from = $2, handoff_to = $3, handoff_note = $4, handoff_at = now() where id = $1`,
    [itemId, moderatorId, input.toUserId ?? null, input.note || null],
  );
  if (input.toUserId) {
    await notifications.notify(q, input.toUserId, {
      kind: 'moderation_handoff',
      title: 'A moderator asked you to take an item',
      body: 'It is at the top of your moderation queue.',
      data: { itemId },
      dedupeKey: `moderation_handoff:${itemId}:${input.toUserId}`,
    });
  }
}

// The dashboard -----------------------------------------------------------------------

/**
 * Admin → Moderation dashboard: the queue now (size and oldest wait, by source), how fast
 * items were decided in the last `days`, the harmful-prayer check's false-alarm rate
 * (flags a moderator dismissed), floods and handoffs.
 */
export async function dashboard(q: Queryable, days: number) {
  const since = new Date(Date.now() - days * 86_400_000);
  const { rows: queue } = await q.query<{ source: string; pending: number; oldest_minutes: number | null }>(
    `select source::text, count(*)::int as pending, round(extract(epoch from now() - min(created_at)) / 60)::int as oldest_minutes
       from public.moderation_items where status = 'pending' group by source order by source`,
  );
  const { rows: speed } = await q.query<{ source: string; decided: number; median_minutes: number | null; p90_minutes: number | null }>(
    `select source::text, count(*)::int as decided,
            round((percentile_cont(0.5) within group (order by extract(epoch from decided_at - created_at)) / 60)::numeric, 1)::float as median_minutes,
            round((percentile_cont(0.9) within group (order by extract(epoch from decided_at - created_at)) / 60)::numeric, 1)::float as p90_minutes
       from public.moderation_items where decided_at >= $1 group by source order by source`,
    [since],
  );
  const { rows: falseAlarms } = await q.query<{ category: string; decided: number; dismissed: number; rate: number | null }>(
    `select coalesce(ai_categories -> 'harm' ->> 0, 'flood') as category, count(*)::int as decided,
            count(*) filter (where status = 'dismissed')::int as dismissed,
            round(count(*) filter (where status = 'dismissed')::numeric / nullif(count(*), 0), 2)::float as rate
       from public.moderation_items where source = 'harm' and decided_at >= $1 group by 1 order by 1`,
    [since],
  );
  const { rows: floods } = await q.query<{ floods: number; accounts: number; items: number }>(
    `select count(distinct (user_id, created_at::date))::int as floods, count(distinct user_id)::int as accounts, count(*)::int as items
       from public.harm_events where action = 'bundled' and created_at >= $1`,
    [since],
  );
  const { rows: handoffs } = await q.query<{ n: number }>(`select count(*)::int as n from public.moderation_items where handoff_at >= $1`, [since]);
  return { days, queue, speed, falseAlarms, floods: floods[0]!, handoffs: handoffs[0]!.n };
}

// The weekly tuning report ------------------------------------------------------------

/**
 * For each word rule: how often it flagged in the week and how moderators decided. A rule
 * moderators mostly dismiss is too loose; that is where the word lists need tuning. Floods
 * are left out (they say more about one account than about the words).
 */
export async function weeklyReport(q: Queryable, weekStart: Date) {
  const end = new Date(weekStart.getTime() + 7 * 86_400_000);
  const { rows } = await q.query<{ rule: string; flagged: number; dismissed: number; removed: number; pending: number }>(
    `select r.rule, count(*)::int as flagged,
            count(*) filter (where m.status = 'dismissed')::int as dismissed,
            count(*) filter (where m.status = 'actioned')::int as removed,
            count(*) filter (where m.status = 'pending')::int as pending
       from public.harm_events e cross join lateral unnest(e.rules) as r(rule)
       left join public.moderation_items m on m.source = 'harm' and m.target_type::text = e.target_type and m.target_id = e.target_id
      where e.created_at >= $1 and e.created_at < $2 and e.action <> 'bundled'
      group by r.rule order by count(*) desc, r.rule`,
    [weekStart, end],
  );
  const rules = rows.map((r) => {
    const decided = r.dismissed + r.removed;
    const falseAlarmRate = decided ? Math.round((r.dismissed / decided) * 100) / 100 : null;
    return { ...r, falseAlarmRate, tooLoose: decided >= 3 && falseAlarmRate !== null && falseAlarmRate >= 0.5 };
  });
  const { rows: totals } = await q.query<{ flagged: number; bundled: number }>(
    `select count(*) filter (where action <> 'bundled')::int as flagged, count(*) filter (where action = 'bundled')::int as bundled
       from public.harm_events where created_at >= $1 and created_at < $2`,
    [weekStart, end],
  );
  return { weekStart: weekStart.toISOString().slice(0, 10), ...totals[0]!, rules };
}

/** The Monday of the week before `now` (UTC). */
export function lastWeekStart(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - 7);
  return d;
}

/** Monday: save last week's report and tell the admins (no member text, only counts per rule). Once per week. */
export function weeklyReportTask(q: Queryable): Task {
  return async () => {
    if (!(await settings(q)).weekly_report_enabled) return;
    const report = await weeklyReport(q, lastWeekStart());
    const { rows } = await q.query<{ id: string }>(
      `insert into public.harm_weekly_reports (week_start, report) values ($1, $2) on conflict (week_start) do nothing returning id`,
      [report.weekStart, report],
    );
    if (!rows[0]) return;
    const loose = report.rules.filter((r) => r.tooLoose).map((r) => r.rule);
    const { rows: admins } = await q.query<{ user_id: string }>(`select distinct user_id from public.user_roles where role = 'admin'`);
    for (const a of admins) {
      await notifications.notify(q, a.user_id, {
        kind: 'harm_weekly_report',
        title: 'Weekly harmful-prayer report',
        body:
          `${report.flagged} flagged last week${report.bundled ? `, ${report.bundled} more in floods` : ''}.` +
          (loose.length ? ` Mostly dismissed, worth loosening: ${loose.join(', ')}.` : ' No rule was mostly dismissed.') +
          ' Open Admin → Moderation dashboard.',
        data: { reportId: rows[0].id },
        dedupeKey: `harm_weekly_report:${report.weekStart}:${a.user_id}`,
      });
    }
  };
}

export async function reports(q: Queryable, limit = 12) {
  const { rows } = await q.query(`select id, week_start, report, created_at from public.harm_weekly_reports order by week_start desc limit $1`, [limit]);
  return rows;
}
