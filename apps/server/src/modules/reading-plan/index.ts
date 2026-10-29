// Bible reading plan (Annotated Read, chat 2: "There could be a Bible study site"). Off by
// default. Admins and pastors set a plan of daily passages for their community; members
// see today's passage, open it on a Bible website, mark it read, and can talk it over in
// the plan's group chat. Communities with neutral wording (Open Circle) never see it.
// Days are counted in UTC from the plan's start date.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, forbidden, notFound } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import * as communities from '../communities/index.js';

async function settings(q: Queryable) {
  const { rows } = await q.query<{ on: boolean; url: string }>('select reading_plan_enabled as on, reading_plan_url as url from public.notebook_settings');
  return rows[0] ?? { on: false, url: '' };
}

export const passageUrl = (template: string, ref: string) => template.replace('{ref}', encodeURIComponent(ref));

/** Today's passage of the member's community's current plan. */
export async function today(q: Queryable, userId: string) {
  const s = await settings(q);
  if (!s.on || (await communities.isSecular(q, userId))) return { enabled: false as const };
  const { rows } = await q.query<{ id: string; title: string; conversation_id: string | null; day: number; days: number }>(
    `select p.id, p.title, p.conversation_id, (current_date - p.starts_on) + 1 as day,
            (select max(d.day) from public.reading_plan_days d where d.plan_id = p.id) as days
       from public.reading_plans p
      where p.community_id = public.member_community_id($1) and p.archived_at is null and p.starts_on <= current_date
      order by p.starts_on desc, p.created_at desc limit 1`,
    [userId],
  );
  const plan = rows[0];
  if (!plan || plan.day > plan.days) return { enabled: true as const, plan: null };
  const { rows: d } = await q.query<{ reference: string; read: boolean; readers: number }>(
    `select d.reference,
            exists (select 1 from public.reading_plan_reads r where r.plan_id = d.plan_id and r.day = d.day and r.user_id = $3) as read,
            (select count(*)::int from public.reading_plan_reads r where r.plan_id = d.plan_id and r.day = d.day) as readers
       from public.reading_plan_days d where d.plan_id = $1 and d.day = $2`,
    [plan.id, plan.day, userId],
  );
  const day = d[0];
  return {
    enabled: true as const,
    plan: {
      id: plan.id,
      title: plan.title,
      day: plan.day,
      days: plan.days,
      conversationId: plan.conversation_id,
      reading: day ? { reference: day.reference, url: passageUrl(s.url, day.reference), read: day.read, readers: day.readers } : null,
    },
  };
}

export async function markRead(q: Queryable, userId: string, planId: string) {
  const now = await today(q, userId);
  if (!now.enabled || !now.plan || now.plan.id !== planId || !now.plan.reading) throw notFound('Reading');
  await q.query('insert into public.reading_plan_reads (plan_id, day, user_id) values ($1, $2, $3) on conflict do nothing', [planId, now.plan.day, userId]);
  return today(q, userId);
}

// Staff -------------------------------------------------------------------------------

export async function requireStaff(q: Queryable, userId: string) {
  if (!(await settings(q)).on) throw forbidden('Reading plans are off');
  if (!(await hasRole(q, userId, 'admin', 'pastor'))) throw forbidden('Admins and pastors only');
  if (await communities.isSecular(q, userId)) throw forbidden('Reading plans are not offered in this community');
}

export const NewPlan = z.object({
  title: z.string().trim().min(1).max(80),
  startsOn: z.iso.date(),
  references: z.array(z.string().trim().min(1).max(100)).min(1).max(366),
  conversationId: z.uuid().nullable().optional(),
});

export async function create(q: Queryable, userId: string, input: z.infer<typeof NewPlan>) {
  await requireStaff(q, userId);
  if (input.conversationId) {
    const { rowCount } = await q.query(
      `select 1 from public.conversations c join public.conversation_members m on m.conversation_id = c.id
        where c.id = $1 and c.kind = 'group' and m.user_id = $2 and m.status = 'active'`,
      [input.conversationId, userId],
    );
    if (!rowCount) throw badRequest('Pick a group you belong to');
  }
  const { rows } = await q.query<{ id: string }>(
    `insert into public.reading_plans (community_id, title, starts_on, created_by, conversation_id)
     values (public.member_community_id($1), $2, $3, $1, $4) returning id`,
    [userId, input.title, input.startsOn, input.conversationId ?? null],
  );
  const id = rows[0]!.id;
  await q.query(
    'insert into public.reading_plan_days (plan_id, day, reference) select $1, n, r from unnest($2::text[]) with ordinality as t(r, n)',
    [id, input.references],
  );
  return { id };
}

export async function plans(q: Queryable, userId: string) {
  await requireStaff(q, userId);
  const { rows } = await q.query<{ id: string; title: string; starts_on: string; days: number; archived_at: Date | null; readers: number }>(
    `select p.id, p.title, to_char(p.starts_on, 'YYYY-MM-DD') as starts_on, p.archived_at,
            (select count(*)::int from public.reading_plan_days d where d.plan_id = p.id) as days,
            (select count(distinct r.user_id)::int from public.reading_plan_reads r where r.plan_id = p.id) as readers
       from public.reading_plans p where p.community_id = public.member_community_id($1)
      order by p.archived_at is not null, p.starts_on desc, p.created_at desc limit 50`,
    [userId],
  );
  return rows.map((r) => ({ id: r.id, title: r.title, startsOn: r.starts_on, days: r.days, readers: r.readers, archived: !!r.archived_at }));
}

export async function archive(q: Queryable, userId: string, planId: string) {
  await requireStaff(q, userId);
  const { rowCount } = await q.query(
    'update public.reading_plans set archived_at = now() where id = $1 and community_id = public.member_community_id($2) and archived_at is null',
    [planId, userId],
  );
  if (!rowCount) throw notFound('Reading plan');
  return { archived: true };
}
