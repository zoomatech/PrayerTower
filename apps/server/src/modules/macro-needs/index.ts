// Macro Needs: a large need featured at the top of the feed with both prayer
// and material-help options. Staff create one; it is backed by an ordinary
// prayer request, so praying, committing and giving tokens work as usual.
// Material help is links to relief partners (placeholder until the partner
// process is decided); Prayer Tower never handles the money.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { forbidden, notFound } from '../../errors.js';
import * as accounts from '../accounts/index.js';
import * as posts from '../posts/index.js';
import * as tokens from '../tokens/index.js';

/** Placeholder: how many macro needs are featured at once. */
export const MAX_FEATURED = 3;

export const NewMacroNeed = z.object({
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(2000),
  realm: z.enum(posts.PRAYER_REALMS).default('national'),
  helpOptions: z
    .array(z.object({ label: z.string().trim().min(1).max(60), url: z.url({ protocol: /^https$/ }) }))
    .max(5)
    .default([]),
  endsAt: z.iso.datetime({ offset: true }).nullable().default(null),
});

async function requireStaff(q: Queryable, userId: string) {
  if (!(await accounts.hasRole(q, userId, 'admin', 'moderator'))) throw forbidden();
}

export async function create(q: Queryable, userId: string, input: z.infer<typeof NewMacroNeed>) {
  await requireStaff(q, userId);
  const post = await posts.create(q, userId, {
    postType: 'prayer_request',
    body: input.body,
    realm: input.realm,
    kind: 'intercessory',
    urgency: 3,
    isAnonymous: true,
    isSensitive: false,
    media: [],
  });
  const { rows } = await q.query<{ id: string }>(
    `insert into public.macro_needs (post_id, title, help_options, created_by, ends_at) values ($1, $2, $3, $4, $5) returning id`,
    [post.id, input.title, JSON.stringify(input.helpOptions), userId, input.endsAt],
  );
  return { id: rows[0]!.id, postId: post.id };
}

export async function end(q: Queryable, userId: string, id: string) {
  await requireStaff(q, userId);
  const { rowCount } = await q.query('update public.macro_needs set ended_at = coalesce(ended_at, now()) where id = $1', [id]);
  if (!rowCount) throw notFound('Macro need');
}

/** Featured needs, newest first, with the viewer's card for the request and what others have done. */
export async function featured(q: Queryable, viewerId: string) {
  const { rows } = await q.query<{
    id: string;
    post_id: string;
    title: string;
    help_options: { label: string; url: string }[];
    ends_at: Date | null;
    helpers: number;
    helped: boolean;
    prayers: number;
  }>(
    `select n.id, n.post_id, n.title, n.help_options, n.ends_at,
            (select count(*)::int from public.macro_need_helpers h where h.need_id = n.id) as helpers,
            exists (select 1 from public.macro_need_helpers h where h.need_id = n.id and h.user_id = $1) as helped,
            (select count(distinct e.user_id)::int from public.prayer_events e where e.post_id = n.post_id) as prayers
       from public.macro_needs n join public.posts p on p.id = n.post_id
      where n.ended_at is null and (n.ends_at is null or n.ends_at > now()) and p.moderation_status = 'visible'
      order by n.created_at desc limit $2`,
    [viewerId, MAX_FEATURED],
  );
  const cards = await posts.cards(q, rows.map((r) => r.post_id), viewerId);
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      title: r.title,
      helpOptions: r.help_options,
      endsAt: r.ends_at,
      card: cards.find((c) => c.id === r.post_id) ?? null,
      prayers: r.prayers,
      tokens: await tokens.reachOf(q, r.post_id),
      helpers: r.helpers,
      helped: r.helped,
    })),
  );
}

/** The member says they gave material help. Idempotent. */
export async function markHelped(q: Queryable, userId: string, id: string) {
  const { rows } = await q.query<{ id: string }>('select id from public.macro_needs where id = $1 and ended_at is null', [id]);
  if (!rows[0]) throw notFound('Macro need');
  await q.query('insert into public.macro_need_helpers (need_id, user_id) values ($1, $2) on conflict do nothing', [id, userId]);
  const { rows: n } = await q.query<{ n: number }>('select count(*)::int as n from public.macro_need_helpers where need_id = $1', [id]);
  return n[0]!.n;
}

/** Post ids of featured needs, so the feed doesn't show them twice. */
export async function featuredPostIds(q: Queryable): Promise<string[]> {
  const { rows } = await q.query<{ post_id: string }>(
    `select post_id from public.macro_needs where ended_at is null and (ends_at is null or ends_at > now()) order by created_at desc limit $1`,
    [MAX_FEATURED],
  );
  return rows.map((r) => r.post_id);
}
