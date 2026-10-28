// In-app announcements: admins post a banner or notice to every member, in
// English and (optionally) Spanish. Each member dismisses one for themselves.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { notFound } from '../../errors.js';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((s) => (s ? s : null));

export const NewAnnouncement = z
  .object({
    kind: z.enum(['banner', 'notice']).default('banner'),
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().max(1000).default(''),
    titleEs: optionalText(120),
    bodyEs: optionalText(1000),
    /** Hours until it ends by itself; null keeps it up until an admin ends it. */
    durationHours: z.number().int().min(1).max(24 * 90).nullable().default(null),
  })
  .refine((a) => !a.bodyEs || a.titleEs, { message: 'Add a Spanish title with the Spanish text', path: ['titleEs'] });

export interface Announcement {
  id: string;
  kind: 'banner' | 'notice';
  title: string;
  body: string;
  titleEs: string | null;
  bodyEs: string | null;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
}

interface Row {
  id: string;
  kind: 'banner' | 'notice';
  title: string;
  body: string;
  title_es: string | null;
  body_es: string | null;
  starts_at: Date;
  ends_at: Date | null;
  created_at: Date;
}

const COLUMNS = 'a.id, a.kind, a.title, a.body, a.title_es, a.body_es, a.starts_at, a.ends_at, a.created_at';
const toAnnouncement = (r: Row): Announcement => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  body: r.body,
  titleEs: r.title_es,
  bodyEs: r.body_es,
  startsAt: r.starts_at.toISOString(),
  endsAt: r.ends_at?.toISOString() ?? null,
  createdAt: r.created_at.toISOString(),
});

export async function create(q: Queryable, staffId: string, input: z.infer<typeof NewAnnouncement>): Promise<Announcement> {
  const { rows } = await q.query<Row>(
    `insert into public.announcements as a (kind, title, body, title_es, body_es, ends_at, created_by)
     values ($1, $2, $3, $4, $5, case when $6::int is null then null else now() + make_interval(hours => $6::int) end, $7)
     returning ${COLUMNS}`,
    [input.kind, input.title, input.body, input.titleEs, input.bodyEs, input.durationHours, staffId],
  );
  return toAnnouncement(rows[0]!);
}

/** What a member sees now: started, not ended, not dismissed by them. Newest first. */
export async function activeFor(q: Queryable, userId: string): Promise<Announcement[]> {
  const { rows } = await q.query<Row>(
    `select ${COLUMNS} from public.announcements a
      where a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
        and not exists (select 1 from public.announcement_dismissals d where d.announcement_id = a.id and d.user_id = $1)
      order by a.created_at desc limit 5`,
    [userId],
  );
  return rows.map(toAnnouncement);
}

export async function dismiss(q: Queryable, userId: string, id: string): Promise<void> {
  const { rowCount } = await q.query(
    `insert into public.announcement_dismissals (user_id, announcement_id)
     select $1, a.id from public.announcements a where a.id = $2
     on conflict do nothing`,
    [userId, id],
  );
  if (rowCount === 0) {
    const { rows } = await q.query('select 1 from public.announcements where id = $1', [id]);
    if (!rows[0]) throw notFound('Announcement');
  }
}

/** Admin list: newest first, with how many members dismissed each. */
export async function list(q: Queryable): Promise<(Announcement & { active: boolean; dismissals: number })[]> {
  const { rows } = await q.query<Row & { active: boolean; dismissals: number }>(
    `select ${COLUMNS}, (a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())) as active,
            (select count(*)::int from public.announcement_dismissals d where d.announcement_id = a.id) as dismissals
       from public.announcements a order by a.created_at desc limit 100`,
  );
  return rows.map((r) => ({ ...toAnnouncement(r), active: r.active, dismissals: r.dismissals }));
}

/** Take it down for everyone now. */
export async function end(q: Queryable, id: string): Promise<Announcement> {
  const { rows } = await q.query<Row>(
    `update public.announcements a set ends_at = greatest(now(), a.starts_at + interval '1 microsecond')
      where a.id = $1 and (a.ends_at is null or a.ends_at > now())
      returning ${COLUMNS}`,
    [id],
  );
  if (rows[0]) return toAnnouncement(rows[0]);
  const { rows: existing } = await q.query<Row>(`select ${COLUMNS} from public.announcements a where a.id = $1`, [id]);
  if (!existing[0]) throw notFound('Announcement');
  return toAnnouncement(existing[0]);
}
