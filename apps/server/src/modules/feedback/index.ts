// Pilot feedback: members tell us what's broken or confusing from inside the
// app; admins read it on the admin screen and close it when handled.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { notFound } from '../../errors.js';

export const NewFeedback = z.object({
  kind: z.enum(['bug', 'idea', 'other']).default('other'),
  body: z.string().trim().min(1).max(2000),
  platform: z.string().max(20).optional(),
  appVersion: z.string().max(40).optional(),
});

export async function create(q: Queryable, userId: string, input: z.infer<typeof NewFeedback>) {
  const { rows } = await q.query<{ id: string }>(
    'insert into public.feedback (user_id, kind, body, platform, app_version) values ($1, $2, $3, $4, $5) returning id',
    [userId, input.kind, input.body, input.platform ?? null, input.appVersion ?? null],
  );
  return rows[0]!.id;
}

export async function open(q: Queryable, limit = 100) {
  const { rows } = await q.query(
    `select f.id, f.kind, f.body, f.platform, f.app_version, f.created_at, f.user_id,
            coalesce(nullif(p.display_name, ''), 'Member') as name
       from public.feedback f join public.profiles p on p.id = f.user_id
      where f.status = 'open' order by f.created_at limit $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id, kind: r.kind, body: r.body, platform: r.platform, appVersion: r.app_version, createdAt: r.created_at, userId: r.user_id, name: r.name,
  }));
}

export async function close(q: Queryable, adminId: string, id: string) {
  const { rowCount } = await q.query(
    `update public.feedback set status = 'closed', closed_by = $2, closed_at = now() where id = $1 and status = 'open'`,
    [id, adminId],
  );
  if (!rowCount) throw notFound('Feedback');
}
