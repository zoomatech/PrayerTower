// Accounts module: profiles, onboarding answers, roles, follows, and how a
// person is presented to others (anonymity is applied here, at output time;
// the author link is always stored).
import { FEED_MIX_KEYS, type FeedMix, type FeedMixKey } from '@prayer-tower/shared';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, conflict, notFound } from '../../errors.js';

export const WHY_HERE = ['pray_for_others', 'prayer_for_myself', 'pray_without_ceasing', 'extend_reach'] as const;
export const PRAY_FOR_SCOPE = ['family', 'friends', 'church', 'community', 'nation', 'world'] as const;
export type Role = 'admin' | 'moderator' | 'pastor_counselor' | 'prayer_partner' | 'witness';

export const ProfileUpdate = z
  .object({
    displayName: z.string().trim().min(1).max(80),
    handle: z.string().regex(/^[a-z0-9_]{3,30}$/),
    bio: z.string().max(500),
    whyHere: z.array(z.enum(WHY_HERE)).max(WHY_HERE.length),
    supportWanted: z.array(z.string().max(60)).max(20),
    supportOffered: z.array(z.string().max(60)).max(20),
    prayForScope: z.array(z.enum(PRAY_FOR_SCOPE)).max(PRAY_FOR_SCOPE.length),
    traumaContentOptOut: z.boolean(),
    anonymousByDefault: z.boolean(),
    updatesInFirstComment: z.boolean(),
    promptsEnabled: z.boolean(),
    promptMinHours: z.number().int().min(1).max(168).nullable(),
    feedMix: z.partialRecord(z.enum(FEED_MIX_KEYS as [FeedMixKey, ...FeedMixKey[]]), z.enum(['less', 'more'])),
    completeOnboarding: z.boolean(),
  })
  .partial();

const columns: Record<string, string> = {
  displayName: 'display_name',
  handle: 'handle',
  bio: 'bio',
  whyHere: 'why_here',
  supportWanted: 'support_wanted',
  supportOffered: 'support_offered',
  prayForScope: 'pray_for_scope',
  traumaContentOptOut: 'trauma_content_opt_out',
  anonymousByDefault: 'anonymous_by_default',
  updatesInFirstComment: 'updates_in_first_comment',
  promptsEnabled: 'prompts_enabled',
  promptMinHours: 'prompt_min_hours',
  feedMix: 'feed_mix',
};

export interface Profile {
  id: string;
  display_name: string;
  handle: string | null;
  bio: string;
  why_here: string[];
  support_wanted: string[];
  support_offered: string[];
  pray_for_scope: string[];
  trauma_content_opt_out: boolean;
  anonymous_by_default: boolean;
  updates_in_first_comment: boolean;
  prompts_enabled: boolean;
  prompt_min_hours: number | null;
  feed_mix: FeedMix;
  onboarded_at: Date | null;
  suspended_until: Date | null;
  created_at: Date;
}

export async function getProfile(q: Queryable, userId: string): Promise<Profile | null> {
  const { rows } = await q.query<Profile>('select * from public.profiles where id = $1', [userId]);
  return rows[0] ?? null;
}

export async function updateProfile(q: Queryable, userId: string, input: z.infer<typeof ProfileUpdate>): Promise<Profile> {
  const sets: string[] = [];
  const values: unknown[] = [userId];
  for (const [key, value] of Object.entries(input)) {
    const col = columns[key];
    if (!col || value === undefined) continue;
    values.push(value);
    sets.push(`${col} = $${values.length}`);
  }
  if (input.completeOnboarding) sets.push('onboarded_at = coalesce(onboarded_at, now())');
  if (sets.length === 0) throw badRequest('Nothing to update');
  try {
    const { rows } = await q.query<Profile>(`update public.profiles set ${sets.join(', ')} where id = $1 returning *`, values);
    if (!rows[0]) throw notFound('Profile');
    return rows[0];
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw conflict('That handle is taken');
    throw err;
  }
}

export async function revokeRole(q: Queryable, userId: string, role: Role) {
  await q.query('delete from public.user_roles where user_id = $1 and role = $2', [userId, role]);
}

export async function roles(q: Queryable, userId: string): Promise<Role[]> {
  const { rows } = await q.query<{ role: Role }>('select role from public.user_roles where user_id = $1 order by role', [userId]);
  return rows.map((r) => r.role);
}

/** Every member id, for system-wide jobs such as the weekly resupply. */
export async function allMemberIds(q: Queryable): Promise<string[]> {
  const { rows } = await q.query<{ id: string }>('select id from public.profiles order by id');
  return rows.map((r) => r.id);
}

export async function metrics(q: Queryable, since: Date) {
  const { rows } = await q.query(
    `select count(*)::int as members,
            count(*) filter (where created_at >= $1)::int as new_members,
            count(*) filter (where onboarded_at is not null)::int as onboarded
       from public.profiles`,
    [since],
  );
  return rows[0];
}

/** Communities the member sees in their feed. V1 has one: the default Christian ecumenical community. */
export async function communityIds(q: Queryable, userId: string): Promise<string[]> {
  const { rows } = await q.query<{ community_id: string }>(
    'select community_id from public.community_memberships where user_id = $1',
    [userId],
  );
  return rows.map((r) => r.community_id);
}

/** Where the member's new posts go. */
export async function primaryCommunityId(q: Queryable, userId: string): Promise<string> {
  const { rows } = await q.query<{ id: string }>(
    `select coalesce(
       (select community_id from public.community_memberships where user_id = $1 and is_primary),
       public.default_community_id()) as id`,
    [userId],
  );
  return rows[0]!.id;
}

export async function hasRole(q: Queryable, userId: string, ...roles: Role[]): Promise<boolean> {
  const { rows } = await q.query('select 1 from public.user_roles where user_id = $1 and role = any($2::public.app_role[])', [
    userId,
    roles,
  ]);
  return rows.length > 0;
}

export async function grantRole(q: Queryable, userId: string, role: Role, grantedBy: string | null) {
  await q.query('insert into public.user_roles (user_id, role, granted_by) values ($1, $2, $3) on conflict do nothing', [
    userId,
    role,
    grantedBy,
  ]);
}

export async function follow(q: Queryable, userId: string, followeeId: string) {
  if (userId === followeeId) throw badRequest('You cannot follow yourself');
  const { rowCount } = await q.query('select 1 from public.profiles where id = $1', [followeeId]);
  if (!rowCount) throw notFound('Person');
  await q.query('insert into public.follows (user_id, followee_id) values ($1, $2) on conflict do nothing', [userId, followeeId]);
}

export async function unfollow(q: Queryable, userId: string, followeeId: string) {
  await q.query('delete from public.follows where user_id = $1 and followee_id = $2', [userId, followeeId]);
}

/** Whether the viewer follows this person, and how many people do. */
export async function followStatus(q: Queryable, viewerId: string, personId: string) {
  const { rows } = await q.query<{ following: boolean; followers: number }>(
    `select exists (select 1 from public.follows where user_id = $1 and followee_id = $2) as following,
            (select count(*)::int from public.follows where followee_id = $2) as followers`,
    [viewerId, personId],
  );
  return rows[0]!;
}

/** Admin lookup by name or sign-in email, with each person's roles. */
export async function search(q: Queryable, term: string, limit = 20) {
  const { rows } = await q.query<{ id: string; display_name: string; email: string | null; roles: Role[] }>(
    `select p.id, p.display_name, u.email,
            coalesce(array_agg(r.role::text order by r.role) filter (where r.role is not null), '{}')::text[] as roles
       from public.profiles p
       left join auth.users u on u.id = p.id
       left join public.user_roles r on r.user_id = p.id
      where p.display_name ilike '%' || $1 || '%' or u.email ilike '%' || $1 || '%'
      group by p.id, u.email
      order by p.display_name
      limit $2`,
    [term, limit],
  );
  return rows;
}

export async function followers(q: Queryable, userId: string) {
  const { rows } = await q.query(
    `select p.id, p.display_name, p.handle from public.follows f join public.profiles p on p.id = f.user_id
      where f.followee_id = $1 order by f.created_at desc`,
    [userId],
  );
  return rows;
}

/** Everyone the member follows or is followed by: who they can ask to pray. */
export async function connections(q: Queryable, userId: string) {
  const { rows } = await q.query<{ id: string; display_name: string; handle: string | null }>(
    `select p.id, p.display_name, p.handle from public.profiles p
      where p.id <> $1 and p.id in (
        select followee_id from public.follows where user_id = $1
        union select user_id from public.follows where followee_id = $1)
      order by p.display_name`,
    [userId],
  );
  return rows;
}

export async function following(q: Queryable, userId: string) {
  const { rows } = await q.query(
    `select p.id, p.display_name, p.handle from public.follows f join public.profiles p on p.id = f.followee_id
      where f.user_id = $1 order by f.created_at desc`,
    [userId],
  );
  return rows;
}

export interface PublicIdentity {
  id: string | null;
  displayName: string;
  handle: string | null;
  anonymous: boolean;
}

/** How a person appears to a viewer. Anonymous people are shown as "Anonymous" to everyone but themselves. */
export function presentIdentity(
  person: { id: string; display_name: string; handle: string | null },
  isAnonymous: boolean,
  viewerId: string | null,
): PublicIdentity {
  if (isAnonymous && person.id !== viewerId) return { id: null, displayName: 'Anonymous', handle: null, anonymous: true };
  return { id: person.id, displayName: person.display_name || 'Member', handle: person.handle, anonymous: isAnonymous };
}
