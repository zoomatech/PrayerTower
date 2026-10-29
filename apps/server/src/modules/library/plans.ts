// Reading plans (docs/LIBRARY_SEARCH.md): curated plans from data/library/plans.json, read in the app from the
// library's own texts ("Oldest texts in 30 days", "The Gospels in 89 days"). A member follows a plan at their own
// pace (the next day is the first one not yet read; nothing is ever "behind"), can read it together with one of
// their prayer circles, and gets at most one gentle evening reminder on a day they haven't read, which stops
// after two weeks with no reading. Open Circle is offered only the plans with no Bible or Apocrypha in them.
// Separate from the staff-set Bible reading plan (modules/reading-plan). Off by default.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Task } from 'graphile-worker';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, forbidden, notFound } from '../../errors.js';
import * as notifications from '../notifications/index.js';
import { collection, COLLECTIONS, dataDir, features, offered, settings, TITLES, type CollectionId } from './index.js';
import { excerpt, locate } from './parallels.js';

type Mark = { ref?: string; find?: string };
type Part = { collection: CollectionId; workId: string; from?: Mark; to?: Mark; until?: Mark; days?: number; chapters?: number };
type PlanSpec = { id: string; title: string; intro: string; parts: Part[] };
/** One day's reading: passages from one place, and how they are cited ("Matthew 5", "Psalms 1–5"). */
type Day = { collection: CollectionId; from: number; count: number; cite?: string };

let specs: PlanSpec[] | undefined;

export function planSpecs(): PlanSpec[] {
  if (specs) return specs;
  const file = JSON.parse(readFileSync(path.join(dataDir(), 'plans.json'), 'utf8')) as { format_version: 1; plans: PlanSpec[] };
  if (file.format_version !== 1) throw new Error('plans.json is not readable');
  for (const p of file.plans) for (const part of p.parts) if (!COLLECTIONS.includes(part.collection)) throw new Error(`plans.json: ${p.id} names ${part.collection}`);
  specs = file.plans;
  return specs;
}

const faith = (p: PlanSpec) => p.parts.some((part) => TITLES[part.collection].faith);

const madeDays = new Map<string, Day[]>();

/** The plan's days, worked out once from its parts. */
export function planDays(plan: PlanSpec): Day[] {
  const known = madeDays.get(plan.id);
  if (known) return known;
  const days: Day[] = [];
  for (const part of plan.parts) {
    const { passages } = collection(part.collection).index;
    const at = (m: Mark) => locate({ collection: part.collection, workId: part.workId, ...m });
    let start = part.from ? at(part.from) : passages.findIndex((p) => p.workId === part.workId);
    // The work runs to where the next one begins.
    let end = start < 0 ? -1 : start;
    while (end >= 0 && end < passages.length && passages[end]!.workId === part.workId) end++;
    if (part.to) end = at(part.to) + 1;
    if (part.until) end = at(part.until);
    if (start < 0 || end <= start) throw new Error(`plans.json: ${plan.id} has an empty part (${part.workId})`);
    if (part.chapters) {
      // Bible books by chapter: "Matthew 5:3" is chapter 5 of Matthew.
      const chapterOf = (i: number) => /^(.*) (\d+):\d+$/.exec(passages[i]!.ref)!;
      while (start < end) {
        const first = chapterOf(start);
        let i = start;
        let taken = 0;
        let last = first;
        while (i < end && taken < part.chapters) {
          const chapter = chapterOf(i)[2];
          while (i < end && chapterOf(i)[2] === chapter) i++;
          last = chapterOf(i - 1);
          taken++;
        }
        const cite = first[2] === last[2] ? `${first[1]} ${first[2]}` : `${first[1]} ${first[2]}–${last[2]}`;
        days.push({ collection: part.collection, from: start, count: i - start, cite });
        start = i;
      }
    } else {
      const n = part.days ?? 1;
      for (let d = 0; d < n; d++) {
        const from = start + Math.round(((end - start) * d) / n);
        const to = start + Math.round(((end - start) * (d + 1)) / n);
        if (to > from) days.push({ collection: part.collection, from, count: to - from });
      }
    }
  }
  madeDays.set(plan.id, days);
  return days;
}

/** The plans this member may follow, or null while plans are off. */
async function offeredPlans(q: Queryable, userId: string) {
  if (!(await features(q)).libraryPlans) return null;
  const ids = await offered(q, userId);
  return ids ? planSpecs().filter((p) => p.parts.every((part) => ids.includes(part.collection))) : null;
}

async function offeredPlan(q: Queryable, userId: string, planId: string) {
  const plans = await offeredPlans(q, userId);
  if (!plans) throw forbidden('Reading plans are off');
  const plan = plans.find((p) => p.id === planId);
  if (!plan) throw notFound('Reading plan');
  return plan;
}

type Follow = { plan_id: string; circle_id: string | null; circle_name: string | null; reminders: boolean; finished_at: Date | null; read: number[] };

async function follows(q: Queryable, userId: string) {
  const { rows } = await q.query<Follow>(
    `select f.plan_id, f.circle_id, c.name as circle_name, f.reminders, f.finished_at,
            coalesce((select array_agg(r.day order by r.day) from public.library_plan_reads r where r.user_id = f.user_id and r.plan_id = f.plan_id), '{}') as read
       from public.library_plan_follows f left join public.prayer_circles c on c.id = f.circle_id
      where f.user_id = $1`,
    [userId],
  );
  return new Map(rows.map((r) => [r.plan_id, r]));
}

function progress(f: Follow, days: number) {
  const read = new Set(f.read);
  let next = 1;
  while (read.has(next)) next++;
  return {
    read: read.size,
    next: next > days ? null : next,
    finished: f.finished_at !== null,
    reminders: f.reminders,
    circle: f.circle_id ? { id: f.circle_id, name: f.circle_name ?? '' } : null,
  };
}

/** The member's circles reading each plan together: who in them follows it with that circle. */
async function circlesReading(q: Queryable, userId: string) {
  const { rows } = await q.query<{ plan_id: string; id: string; name: string; readers: number }>(
    `select f.plan_id, c.id, c.name, count(*)::int as readers
       from public.prayer_circle_members m
       join public.prayer_circles c on c.id = m.circle_id
       join public.library_plan_follows f on f.circle_id = c.id
       join public.prayer_circle_members fm on fm.circle_id = c.id and fm.user_id = f.user_id
      where m.user_id = $1
      group by f.plan_id, c.id, c.name order by c.name`,
    [userId],
  );
  return rows;
}

export async function list(q: Queryable, userId: string) {
  const plans = await offeredPlans(q, userId);
  if (!plans) return { enabled: false as const };
  const mine = await follows(q, userId);
  const together = await circlesReading(q, userId);
  const { rows: circles } = await q.query<{ id: string; name: string }>(
    `select c.id, c.name from public.prayer_circle_members m join public.prayer_circles c on c.id = m.circle_id where m.user_id = $1 order by c.name`,
    [userId],
  );
  return {
    enabled: true as const,
    circles,
    plans: plans.map((p) => {
      const days = planDays(p).length;
      const f = mine.get(p.id);
      return {
        id: p.id,
        title: p.title,
        intro: p.intro,
        days,
        faith: faith(p),
        following: f ? progress(f, days) : null,
        circles: together.filter((c) => c.plan_id === p.id).map(({ id, name, readers }) => ({ id, name, readers })),
      };
    }),
  };
}

async function inCircle(q: Queryable, userId: string, circleId: string) {
  const { rowCount } = await q.query('select 1 from public.prayer_circle_members where circle_id = $1 and user_id = $2', [circleId, userId]);
  return !!rowCount;
}

export const FollowInput = z.object({ circleId: z.uuid().nullable().optional(), reminders: z.boolean().optional() });

export async function follow(q: Queryable, userId: string, planId: string, input: z.infer<typeof FollowInput>) {
  await offeredPlan(q, userId, planId);
  if (input.circleId && !(await inCircle(q, userId, input.circleId))) throw badRequest('Pick a circle you belong to');
  await q.query(
    `insert into public.library_plan_follows (user_id, plan_id, circle_id, reminders) values ($1, $2, $3, coalesce($4, true))
     on conflict (user_id, plan_id) do update set
       circle_id = case when $5 then excluded.circle_id else library_plan_follows.circle_id end,
       reminders = coalesce($4, library_plan_follows.reminders)`,
    [userId, planId, input.circleId ?? null, input.reminders ?? null, input.circleId !== undefined],
  );
  return list(q, userId);
}

/** Stops following: the plan and what was read in it are forgotten. */
export async function unfollow(q: Queryable, userId: string, planId: string) {
  await q.query('delete from public.library_plan_follows where user_id = $1 and plan_id = $2', [userId, planId]);
  return list(q, userId);
}

/** One day of a plan, with whether it was read and, when reading with a circle, how many there read it too. */
export async function day(q: Queryable, userId: string, planId: string, n: number) {
  const plan = await offeredPlan(q, userId, planId);
  const days = planDays(plan);
  const d = days[n - 1];
  if (!d) throw notFound('Day');
  const f = (await follows(q, userId)).get(planId);
  let circle: { id: string; name: string; readers: number; reading: number } | null = null;
  if (f?.circle_id) {
    const { rows } = await q.query<{ reading: number; readers: number }>(
      `select count(*)::int as reading,
              count(*) filter (where exists (select 1 from public.library_plan_reads r where r.user_id = f.user_id and r.plan_id = f.plan_id and r.day = $3))::int as readers
         from public.library_plan_follows f join public.prayer_circle_members m on m.circle_id = f.circle_id and m.user_id = f.user_id
        where f.circle_id = $1 and f.plan_id = $2`,
      [f.circle_id, planId, n],
    );
    circle = { id: f.circle_id, name: f.circle_name ?? '', readers: rows[0]?.readers ?? 0, reading: rows[0]?.reading ?? 0 };
  }
  return {
    plan: { id: plan.id, title: plan.title, days: days.length },
    day: n,
    reading: excerpt(d.collection, d.from, d.count, d.cite),
    read: f ? f.read.includes(n) : false,
    following: f ? progress(f, days.length) : null,
    circle,
  };
}

export async function markRead(q: Queryable, userId: string, planId: string, n: number) {
  const plan = await offeredPlan(q, userId, planId);
  const days = planDays(plan).length;
  if (n < 1 || n > days) throw notFound('Day');
  const { rowCount } = await q.query(
    `insert into public.library_plan_reads (user_id, plan_id, day)
     select $1, $2, $3 where exists (select 1 from public.library_plan_follows where user_id = $1 and plan_id = $2)
     on conflict do nothing`,
    [userId, planId, n],
  );
  if (rowCount === 0) {
    const f = (await follows(q, userId)).get(planId);
    if (!f) throw badRequest('Follow the plan first');
  }
  await q.query(
    `update public.library_plan_follows set finished_at = now()
      where user_id = $1 and plan_id = $2 and finished_at is null
        and (select count(*) from public.library_plan_reads r where r.user_id = $1 and r.plan_id = $2) >= $3`,
    [userId, planId, days],
  );
  return day(q, userId, planId, n);
}

/** Hourly: one gentle evening reminder (after 6 pm in the member's own time zone) on a day nothing was read. */
export function reminderTask(): Task {
  return async (_payload, helpers) => {
    await helpers.withPgClient(async (client) => {
      const s = await settings(client);
      if (!s.enabled || !s.plansEnabled) return;
      const titles = new Map(planSpecs().map((p) => [p.id, p]));
      const { rows } = await client.query<{ user_id: string; plan_id: string; local_day: string; read: number[] }>(
        `with due as (
           select f.user_id, f.plan_id, coalesce(d.time_zone, 'UTC') as tz, f.last_reminded_on, f.started_at,
                  (select max(r.read_at) from public.library_plan_reads r where r.user_id = f.user_id and r.plan_id = f.plan_id) as last_read
             from public.library_plan_follows f left join public.daily_reminders d on d.user_id = f.user_id
            where f.reminders and f.finished_at is null)
         select distinct on (due.user_id) due.user_id, due.plan_id, to_char(now() at time zone due.tz, 'YYYY-MM-DD') as local_day,
                coalesce((select array_agg(r.day) from public.library_plan_reads r where r.user_id = due.user_id and r.plan_id = due.plan_id), '{}') as read
           from due
          where extract(hour from now() at time zone due.tz) >= 18
            and (due.last_reminded_on is null or due.last_reminded_on < (now() at time zone due.tz)::date)
            and greatest(due.started_at, coalesce(due.last_read, due.started_at)) > now() - interval '14 days'
            and not exists (select 1 from public.library_plan_reads r where r.user_id = due.user_id
                              and (r.read_at at time zone due.tz)::date = (now() at time zone due.tz)::date)
          order by due.user_id, due.last_read desc nulls last
          limit 500`,
      );
      for (const r of rows) {
        const plan = titles.get(r.plan_id);
        if (!plan) continue;
        const read = new Set(r.read);
        let next = 1;
        while (read.has(next)) next++;
        await notifications.notify(client, r.user_id, {
          kind: 'library_plan_reminder',
          title: plan.title,
          body: `Day ${next} is ready whenever you are.`,
          data: { screen: 'reading-plans', planId: plan.id },
          dedupeKey: `library_plan:${r.local_day}`,
        });
        // Every plan of theirs counts as reminded today, so one evening brings one notice.
        await client.query('update public.library_plan_follows set last_reminded_on = $2::date where user_id = $1', [r.user_id, r.local_day]);
      }
    });
  };
}
