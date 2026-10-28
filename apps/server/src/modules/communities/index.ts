// Communities a member can belong to (roadmap/Prayer_Tower_Community_Data_Model.md).
// The default is the Christian Prayer Tower feed. "Open Circle" is the
// non-religious edition (migration 20261029002200), hidden until an admin
// turns it on. A member belongs to one community at a time: it decides their
// feed, where their new posts go, and which wording the app uses.
// Admins can add more (denomination sandboxes, or a community run by a partner
// faith group: migration 20261029004500). New ones start hidden.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { COMMUNITY_FEATURES, POST_TYPES, type CommunityFeature } from '@prayer-tower/shared';
import { badRequest, conflict, forbidden, notFound } from '../../errors.js';

export interface Community {
  slug: string;
  name: string;
  tradition: string;
  status: 'active' | 'hidden' | 'archived';
  isDefault: boolean;
  enabledPostTypes: string[];
  /** 'faith' = Prayer Tower's wording; 'neutral' = Open Circle's, with no religious words. */
  wording: 'faith' | 'neutral';
  description: string | null;
  /** Who runs it, for a community leased to a partner; null = Prayer Tower. */
  operatorName: string | null;
  /** Features hidden for this community's members (COMMUNITY_FEATURES). */
  hiddenFeatures: CommunityFeature[];
}

const COLUMNS = `slug, name, tradition, status, is_default as "isDefault", enabled_post_types::text[] as "enabledPostTypes",
  coalesce(vocabulary ->> 'wording', case when tradition = 'secular' then 'neutral' else 'faith' end) as wording,
  description, operator_name as "operatorName", hidden_features as "hiddenFeatures"`;

/** The member's own community (their primary membership, else the default). */
export async function mine(q: Queryable, userId: string): Promise<Community> {
  const { rows } = await q.query<Community>(`select ${COLUMNS} from public.communities where id = public.member_community_id($1)`, [userId]);
  return rows[0]!;
}

/** Whether the member reads Open Circle's non-religious wording. */
export async function isSecular(q: Queryable, userId: string): Promise<boolean> {
  return (await mine(q, userId)).wording === 'neutral';
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

type AdminCommunity = Community & { members: number; operatorContact: string | null };

export async function all(q: Queryable): Promise<AdminCommunity[]> {
  const { rows } = await q.query<AdminCommunity>(
    `select ${COLUMNS}, operator_contact as "operatorContact",
            (select count(*)::int from public.community_memberships m where m.community_id = c.id) as members
       from public.communities c order by is_default desc, name`,
  );
  return rows;
}

const Details = {
  description: z.string().trim().max(500).nullable().optional(),
  operatorName: z.string().trim().min(1).max(120).nullable().optional(),
  operatorContact: z.string().trim().max(200).nullable().optional(),
};

export const Create = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,40}$/),
  name: z.string().trim().min(1).max(80),
  /** Free text: "christian", "catholic", "jewish", "secular"… */
  tradition: z.string().trim().toLowerCase().min(1).max(60),
  wording: z.enum(['faith', 'neutral']).default('faith'),
  enabledPostTypes: z.array(z.enum(POST_TYPES)).min(1).max(POST_TYPES.length).default(['prayer_request', 'praise', 'open_prayer', 'testimony']),
  ...Details,
});

/** A new community, hidden until an admin turns it on. Members join it only by choosing it. */
export async function create(q: Queryable, input: z.infer<typeof Create>): Promise<Community> {
  // Confession is pastors-only and built for the Christian feed; a neutral community never offers it.
  const types = [...new Set(input.enabledPostTypes)].filter((t) => input.wording === 'faith' || t !== 'confessional');
  if (!types.length) throw badRequest('Choose at least one kind of post');
  try {
    const { rows } = await q.query<Community>(
      `insert into public.communities (slug, name, tradition, status, enabled_post_types, vocabulary, description, operator_name, operator_contact)
       values ($1, $2, $3, 'hidden', $4::public.post_type[], jsonb_build_object('wording', $5::text), $6, $7, $8) returning ${COLUMNS}`,
      [input.slug, input.name, input.tradition, types, input.wording, input.description ?? null, input.operatorName ?? null, input.operatorContact ?? null],
    );
    return rows[0]!;
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw conflict('A community with that short name already exists');
    throw err;
  }
}

export const Update = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  status: z.enum(['active', 'hidden']).optional(),
  /** The kinds of post members of this community can make (e.g. turn on discussion, news and blog posts). */
  enabledPostTypes: z.array(z.enum(POST_TYPES)).min(1).max(POST_TYPES.length).optional(),
  /** Features to hide for this community's members, e.g. radio for Open Circle. */
  hiddenFeatures: z.array(z.enum(COMMUNITY_FEATURES)).max(COMMUNITY_FEATURES.length).optional(),
  wording: z.enum(['faith', 'neutral']).optional(),
  ...Details,
});

export async function update(q: Queryable, slug: string, input: z.infer<typeof Update>): Promise<Community> {
  const { rows: found } = await q.query<{ is_default: boolean }>('select is_default from public.communities where slug = $1', [slug]);
  if (!found[0]) throw notFound('Community');
  if (found[0].is_default && input.status === 'hidden') throw badRequest('The default community cannot be hidden');
  // A field left out stays as it is; null clears a detail.
  const keep = (v: string | null | undefined) => (v === undefined ? null : v);
  const { rows } = await q.query<Community>(
    `update public.communities set name = coalesce($2, name), status = coalesce($3::public.community_status, status),
            enabled_post_types = coalesce($4::public.post_type[], enabled_post_types),
            vocabulary = case when $5::text is null then vocabulary else vocabulary || jsonb_build_object('wording', $5::text) end,
            description = case when $6 then $7 else description end,
            operator_name = case when $8 then $9 else operator_name end,
            operator_contact = case when $10 then $11 else operator_contact end,
            hidden_features = coalesce($12::text[], hidden_features)
      where slug = $1 returning ${COLUMNS}`,
    [
      slug,
      input.name ?? null,
      input.status ?? null,
      input.enabledPostTypes ? [...new Set(input.enabledPostTypes)] : null,
      input.wording ?? null,
      input.description !== undefined,
      keep(input.description),
      input.operatorName !== undefined,
      keep(input.operatorName),
      input.operatorContact !== undefined,
      keep(input.operatorContact),
      input.hiddenFeatures ? [...new Set(input.hiddenFeatures)] : null,
    ],
  );
  return rows[0]!;
}

/** Whether a feature is on for this member's community (Admin → Communities can hide it). */
export async function featureOn(q: Queryable, userId: string, feature: CommunityFeature): Promise<boolean> {
  const { rows } = await q.query<{ hidden: boolean }>(
    'select $2 = any (hidden_features) as hidden from public.communities where id = public.member_community_id($1)',
    [userId, feature],
  );
  return !rows[0]?.hidden;
}

export async function requireFeature(q: Queryable, userId: string, feature: CommunityFeature) {
  if (!(await featureOn(q, userId, feature))) throw forbidden('This feature is not available in your community');
}
