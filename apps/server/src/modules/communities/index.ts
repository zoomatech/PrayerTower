// Communities a member can belong to (roadmap/Prayer_Tower_Community_Data_Model.md).
// The default is the Christian Prayer Tower feed. "Open Circle" is the
// non-religious edition (migration 20261029002200), hidden until an admin
// turns it on. A member belongs to one community at a time: it decides their
// feed, where their new posts go, and which wording the app uses.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, notFound } from '../../errors.js';

export interface Community {
  slug: string;
  name: string;
  tradition: string;
  status: 'active' | 'hidden' | 'archived';
  isDefault: boolean;
  enabledPostTypes: string[];
}

const COLUMNS = `slug, name, tradition, status, is_default as "isDefault", enabled_post_types::text[] as "enabledPostTypes"`;

/** The member's own community (their primary membership, else the default). */
export async function mine(q: Queryable, userId: string): Promise<Community> {
  const { rows } = await q.query<Community>(`select ${COLUMNS} from public.communities where id = public.member_community_id($1)`, [userId]);
  return rows[0]!;
}

/** Whether the member reads Open Circle's non-religious wording. */
export async function isSecular(q: Queryable, userId: string): Promise<boolean> {
  return (await mine(q, userId)).tradition === 'secular';
}

/** Communities a member may choose: the active ones. */
export async function choices(q: Queryable): Promise<Community[]> {
  const { rows } = await q.query<Community>(`select ${COLUMNS} from public.communities where status = 'active' order by is_default desc, name`);
  return rows;
}

export const Choose = z.object({ slug: z.string().regex(/^[a-z0-9-]{3,40}$/) });

/**
 * Move the member to another active community. Their earlier posts stay where
 * they were written; from now on their feed and new posts are in the new one.
 */
export async function choose(q: Queryable, userId: string, slug: string): Promise<Community> {
  const { rows } = await q.query<{ id: string }>(`select id from public.communities where slug = $1 and status = 'active'`, [slug]);
  if (!rows[0]) throw notFound('Community');
  const id = rows[0].id;
  await q.query('delete from public.community_memberships where user_id = $1 and community_id <> $2', [userId, id]);
  await q.query(
    `insert into public.community_memberships (community_id, user_id, is_primary) values ($1, $2, true)
     on conflict (community_id, user_id) do update set is_primary = true`,
    [id, userId],
  );
  return mine(q, userId);
}

// Admin -------------------------------------------------------------------------

export async function all(q: Queryable): Promise<(Community & { members: number })[]> {
  const { rows } = await q.query<Community & { members: number }>(
    `select ${COLUMNS}, (select count(*)::int from public.community_memberships m where m.community_id = c.id) as members
       from public.communities c order by is_default desc, name`,
  );
  return rows;
}

export const Update = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  status: z.enum(['active', 'hidden']).optional(),
});

export async function update(q: Queryable, slug: string, input: z.infer<typeof Update>): Promise<Community> {
  const { rows: found } = await q.query<{ is_default: boolean }>('select is_default from public.communities where slug = $1', [slug]);
  if (!found[0]) throw notFound('Community');
  if (found[0].is_default && input.status === 'hidden') throw badRequest('The default community cannot be hidden');
  const { rows } = await q.query<Community>(
    `update public.communities set name = coalesce($2, name), status = coalesce($3::public.community_status, status)
      where slug = $1 returning ${COLUMNS}`,
    [slug, input.name ?? null, input.status ?? null],
  );
  return rows[0]!;
}
