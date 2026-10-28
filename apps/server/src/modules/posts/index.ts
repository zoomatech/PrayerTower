// Posts module: prayer posts, media, comments, reactions (encouragement, well
// wishes, shares), thanks, the request state machine, and the post card.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { product } from '../../config.js';
import type { Queryable } from '../../db.js';
import { badRequest, forbidden, notFound } from '../../errors.js';
import { getProfile, presentIdentity, primaryCommunityId } from '../accounts/index.js';
import * as moderation from '../moderation/index.js';
import { tiersOf } from '../tiers/index.js';
import * as tokens from '../tokens/index.js';

export const POST_TYPES = ['prayer_request', 'praise', 'open_prayer', 'testimony', 'confessional'] as const;
// Kinds and realms of prayer (notebook Page 10) and text-post backgrounds; labels live in packages/shared.
export const PRAYER_KINDS = ['supplication', 'intercessory', 'praise_thanks'] as const;
export const PRAYER_REALMS = ['personal', 'family', 'church_community', 'general_welfare', 'national', 'world'] as const;
export const POST_BACKGROUNDS = ['dawn', 'sky', 'meadow', 'lavender', 'gold', 'night'] as const;
export type PostType = (typeof POST_TYPES)[number];
export type PostState = 'open' | 'actively_prayed' | 'amplified' | 'answered';
export type ModerationStatus = 'visible' | 'hidden_pending_review' | 'removed';

const wordCount = (s: string) => (s.trim() === '' ? 0 : s.trim().split(/\s+/).length);

export const NewPost = z.object({
  postType: z.enum(POST_TYPES),
  body: z
    .string()
    .trim()
    .min(1)
    .max(10_000)
    .refine((s) => wordCount(s) <= product.maxPostWords, `Posts are limited to ${product.maxPostWords} words`),
  kind: z.enum(PRAYER_KINDS).optional(),
  realm: z.enum(PRAYER_REALMS).optional(),
  urgency: z.number().int().min(0).max(3).default(0),
  background: z.enum(POST_BACKGROUNDS).optional(),
  isAnonymous: z.boolean().optional(),
  isSensitive: z.boolean().default(false),
  media: z
    .array(z.object({ kind: z.enum(['image', 'video']), storagePath: z.string().min(1).max(500) }))
    .max(10)
    .default([]),
});

export interface PostRow {
  id: string;
  user_id: string;
  post_type: PostType;
  kind: string | null;
  realm: string | null;
  urgency: number;
  body: string;
  background: string | null;
  is_anonymous: boolean;
  is_sensitive: boolean;
  state: PostState;
  answered_at: Date | null;
  moderation_status: ModerationStatus;
  community_id: string;
  created_at: Date;
}

export async function create(q: Queryable, userId: string, input: z.infer<typeof NewPost>): Promise<PostRow> {
  const profile = await getProfile(q, userId);
  const isAnonymous = input.isAnonymous ?? profile?.anonymous_by_default ?? false;
  for (const m of input.media) {
    if (!m.storagePath.startsWith(`${userId}/`)) throw badRequest('Media must be uploaded through /media/upload-url');
  }
  const { rows } = await q.query<PostRow>(
    `insert into public.posts (user_id, post_type, kind, realm, urgency, body, background, is_anonymous, is_sensitive, community_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
    [
      userId,
      input.postType,
      input.kind ?? null,
      input.realm ?? null,
      input.urgency,
      input.body,
      input.background ?? null,
      isAnonymous,
      input.isSensitive,
      await primaryCommunityId(q, userId),
    ],
  );
  const post = rows[0]!;
  for (const [i, m] of input.media.entries()) {
    await q.query('insert into public.post_media (post_id, user_id, kind, storage_path, position) values ($1, $2, $3, $4, $5)', [
      post.id,
      userId,
      m.kind,
      m.storagePath,
      i,
    ]);
  }
  await moderation.queueScan(q, 'post', post.id);
  return post;
}

export async function get(q: Queryable, postId: string): Promise<PostRow | null> {
  const { rows } = await q.query<PostRow>('select * from public.posts where id = $1', [postId]);
  return rows[0] ?? null;
}

export async function getVisible(q: Queryable, postId: string): Promise<PostRow | null> {
  const post = await get(q, postId);
  return post && post.moderation_status === 'visible' ? post : null;
}

/** Request state machine. Answered is poster-only and final; amplified waits for the broadcast. */
const transitions: Record<PostState, PostState[]> = {
  open: ['actively_prayed', 'answered'],
  actively_prayed: ['amplified', 'answered'],
  amplified: ['answered'],
  answered: [],
};

export function canTransition(from: PostState, to: PostState) {
  return transitions[from].includes(to);
}

/** Called when someone prays or commits: Open becomes Actively Prayed. */
export async function markActivelyPrayed(q: Queryable, postId: string) {
  await q.query(`update public.posts set state = 'actively_prayed' where id = $1 and state = 'open'`, [postId]);
}

export async function markAnswered(q: Queryable, userId: string, postId: string): Promise<PostRow> {
  const post = await get(q, postId);
  if (!post) throw notFound('Post');
  if (post.user_id !== userId) throw forbidden('Only the poster can mark a request answered');
  if (!canTransition(post.state, 'answered')) throw badRequest('This post is already answered');
  const { rows } = await q.query<PostRow>(
    `update public.posts set state = 'answered', answered_at = now() where id = $1 returning *`,
    [postId],
  );
  return rows[0]!;
}

export async function setModerationStatus(q: Queryable, target: moderation.Target, id: string, status: ModerationStatus) {
  const table = { post: 'posts', comment: 'comments', reaction: 'reactions' }[target];
  await q.query(`update public.${table} set moderation_status = $2 where id = $1`, [id, status]);
}

/** The author and text of any moderatable item. */
export async function moderationSubject(q: Queryable, target: moderation.Target, id: string) {
  const sql = {
    post: 'select user_id, community_id, body as text from public.posts where id = $1',
    comment: 'select user_id, community_id, body as text from public.comments where id = $1',
    reaction: 'select user_id, community_id, note as text from public.reactions where id = $1',
  }[target];
  const { rows } = await q.query<{ user_id: string; community_id: string; text: string | null }>(sql, [id]);
  return rows[0] ?? null;
}

// Comments ---------------------------------------------------------------------

export const NewComment = z.object({
  body: z.string().trim().min(1).max(5000),
  parentId: z.uuid().optional(),
  isUpdate: z.boolean().default(false),
  isAnonymous: z.boolean().optional(),
});

export async function addComment(q: Queryable, userId: string, postId: string, input: z.infer<typeof NewComment>) {
  const post = await getVisible(q, postId);
  if (!post) throw notFound('Post');
  if (input.isUpdate && post.user_id !== userId) throw forbidden('Only the poster can add an update');
  if (input.parentId) {
    const { rowCount } = await q.query('select 1 from public.comments where id = $1 and post_id = $2', [input.parentId, postId]);
    if (!rowCount) throw badRequest('Reply target is not on this post');
  }
  const isAnonymous = input.isAnonymous ?? (input.isUpdate ? post.is_anonymous : false);
  const { rows } = await q.query<{ id: string }>(
    `insert into public.comments (post_id, user_id, parent_id, body, is_update, is_anonymous)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [postId, userId, input.parentId ?? null, input.body, input.isUpdate, isAnonymous],
  );
  await moderation.queueScan(q, 'comment', rows[0]!.id);
  return rows[0]!;
}

interface CommentRow {
  id: string;
  parent_id: string | null;
  body: string;
  is_update: boolean;
  is_anonymous: boolean;
  created_at: Date;
  user_id: string;
  display_name: string;
  handle: string | null;
}

const commentSelect = `select c.id, c.parent_id, c.body, c.is_update, c.is_anonymous, c.created_at,
                              p.id as user_id, p.display_name, p.handle
                         from public.comments c join public.profiles p on p.id = c.user_id`;

function presentComment(c: CommentRow, viewerId: string | null) {
  return {
    id: c.id,
    parentId: c.parent_id,
    body: c.body,
    isUpdate: c.is_update,
    createdAt: c.created_at,
    author: presentIdentity({ id: c.user_id, display_name: c.display_name, handle: c.handle }, c.is_anonymous, viewerId),
  };
}

/** Comments in thread order: each reply follows its parent, with its depth for indenting. */
export async function listComments(q: Queryable, postId: string, viewerId: string | null) {
  const { rows } = await q.query<CommentRow>(`${commentSelect} where c.post_id = $1 and c.moderation_status = 'visible' order by c.id`, [
    postId,
  ]);
  const children = new Map<string | null, CommentRow[]>();
  for (const c of rows) {
    const key = c.parent_id && rows.some((r) => r.id === c.parent_id) ? c.parent_id : null;
    children.set(key, [...(children.get(key) ?? []), c]);
  }
  const out: (ReturnType<typeof presentComment> & { depth: number })[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const c of children.get(parent) ?? []) {
      out.push({ ...presentComment(c, viewerId), depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

// Reactions and thanks ---------------------------------------------------------------

export const NewReaction = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('encouragement'), note: z.string().trim().min(1).max(77), isAnonymous: z.boolean().default(false) }),
  z.object({ kind: z.literal('well_wishes'), isAnonymous: z.boolean().default(false) }),
  z.object({ kind: z.literal('share'), note: z.string().trim().max(140).regex(/^[^\n]*$/).optional(), isAnonymous: z.literal(false).default(false) }),
]);

export async function react(q: Queryable, userId: string, postId: string, input: z.infer<typeof NewReaction>) {
  const post = await getVisible(q, postId);
  if (!post) throw notFound('Post');
  const note = 'note' in input ? (input.note ?? null) : null;
  const { rows } = await q.query<{ id: string }>(
    `insert into public.reactions (post_id, user_id, kind, note, is_anonymous) values ($1, $2, $3, $4, $5)
     on conflict (post_id, user_id) where kind = 'well_wishes' do update set created_at = public.reactions.created_at
     returning id`,
    [postId, userId, input.kind, note, input.isAnonymous],
  );
  if (input.kind === 'encouragement') await moderation.queueScan(q, 'reaction', rows[0]!.id);
  return { id: rows[0]!.id, post };
}

export const AskToPray = z.object({
  recipientIds: z.array(z.uuid()).min(1).max(20),
  note: z.string().trim().max(140).optional(),
});

/**
 * "Carol would like you to pray for this": the sender asks people they follow
 * or who follow them. Returns who to notify and the name to show; the author
 * of an anonymous request stays anonymous.
 */
export async function askToPray(q: Queryable, senderId: string, postId: string, input: z.infer<typeof AskToPray>) {
  const post = await getVisible(q, postId);
  if (!post) throw notFound('Post');
  const { rows } = await q.query<{ id: string }>(
    `select distinct id from (
       select followee_id as id from public.follows where user_id = $1
       union select user_id from public.follows where followee_id = $1) c
      where id = any($2::uuid[]) and id <> $1`,
    [senderId, input.recipientIds],
  );
  if (rows.length !== new Set(input.recipientIds.filter((id) => id !== senderId)).size) {
    throw badRequest('You can ask only people you follow or who follow you');
  }
  // Sensitive requests skip anyone who opted out of trauma-related content.
  const recipients = post.is_sensitive
    ? (
        await q.query<{ id: string }>('select id from public.profiles where id = any($1::uuid[]) and not trauma_content_opt_out', [
          rows.map((r) => r.id),
        ])
      ).rows
    : rows;
  const sender = await getProfile(q, senderId);
  const senderName = post.user_id === senderId && post.is_anonymous ? 'Someone' : (sender?.display_name ?? 'Someone');
  return { recipients: recipients.map((r) => r.id), senderName, preview: post.body.slice(0, 120) };
}

export const NewThanks = z.object({
  /** Omit to thank everyone who prayed or committed, anonymous pray-ers included. */
  recipientIds: z.array(z.uuid()).min(1).max(100).optional(),
  icon: z.string().max(30).default('heart'),
  message: z.string().trim().max(77).optional(),
});

/** The poster thanks people who prayed. Only people who actually prayed or committed can be thanked. */
export async function thank(q: Queryable, userId: string, postId: string, input: z.infer<typeof NewThanks>) {
  const post = await get(q, postId);
  if (!post) throw notFound('Post');
  if (post.user_id !== userId) throw forbidden('Only the poster can send thanks');
  const { rows } = await q.query<{ user_id: string }>(
    `select distinct user_id from (
       select user_id from public.prayer_events where post_id = $1
       union select user_id from public.commitments where post_id = $1
     ) s where user_id <> $2 and ($3::uuid[] is null or user_id = any($3::uuid[]))`,
    [postId, userId, input.recipientIds ?? null],
  );
  for (const r of rows) {
    await q.query('insert into public.thanks (post_id, user_id, recipient_id, icon, message) values ($1, $2, $3, $4, $5)', [
      postId,
      userId,
      r.user_id,
      input.icon,
      input.message ?? null,
    ]);
  }
  return { post, recipients: rows.map((r) => r.user_id) };
}

/** Who prayed for a post, by name or "Anonymous", with the total. */
export async function prayers(q: Queryable, postId: string, viewerId: string | null) {
  const { rows } = await q.query<{ id: string; display_name: string; handle: string | null; is_anonymous: boolean; last_prayed_at: Date }>(
    `select p.id, p.display_name, p.handle, bool_and(e.is_anonymous) as is_anonymous, max(e.created_at) as last_prayed_at
       from public.prayer_events e join public.profiles p on p.id = e.user_id
      where e.post_id = $1 group by p.id order by last_prayed_at desc`,
    [postId],
  );
  return {
    count: rows.length,
    people: rows.map((r) => ({ ...presentIdentity(r, r.is_anonymous, viewerId), lastPrayedAt: r.last_prayed_at })),
  };
}

// Cards --------------------------------------------------------------------------

function preview(body: string) {
  if (body.length <= product.previewChars) return { preview: body, truncated: false };
  const cut = body.slice(0, product.previewChars);
  const atWord = cut.lastIndexOf(' ');
  return { preview: (atWord > product.previewChars * 0.6 ? cut.slice(0, atWord) : cut).trimEnd(), truncated: true };
}

export interface CardCounts {
  prayingNow: number;
  prayers: number;
  commitments: number;
  encouragements: number;
  wellWishes: number;
  shares: number;
  comments: number;
}

/** Build post cards for a viewer, in the order given. */
export async function cards(q: Queryable, postIds: string[], viewerId: string | null) {
  if (postIds.length === 0) return [];
  const { rows } = await q.query<
    PostRow & { display_name: string; handle: string | null; private_tier: boolean; counts: CardCounts; media: { kind: string; storagePath: string }[] }
  >(
    `select po.*, pr.display_name, pr.handle, pr.anonymous_by_default as private_tier,
            json_build_object(
              'prayingNow', (select count(*) from public.prayer_events e where e.post_id = po.id and e.kind = 'praying_now'),
              'prayers', (select count(distinct e.user_id) from public.prayer_events e where e.post_id = po.id),
              'commitments', (select count(*) from public.commitments c where c.post_id = po.id and c.status <> 'cancelled'),
              'encouragements', (select count(*) from public.reactions r where r.post_id = po.id and r.kind = 'encouragement' and r.moderation_status = 'visible'),
              'wellWishes', (select count(*) from public.reactions r where r.post_id = po.id and r.kind = 'well_wishes'),
              'shares', (select count(*) from public.reactions r where r.post_id = po.id and r.kind = 'share'),
              'comments', (select count(*) from public.comments c where c.post_id = po.id and c.moderation_status = 'visible')
            ) as counts,
            coalesce((select json_agg(json_build_object('kind', m.kind, 'storagePath', m.storage_path) order by m.position)
                        from public.post_media m where m.post_id = po.id), '[]') as media
       from public.posts po join public.profiles pr on pr.id = po.user_id
      where po.id = any($1::uuid[])`,
    [postIds],
  );

  // First/top comment: the poster's latest update if they bump updates, else the first comment.
  const { rows: tops } = await q.query<CommentRow & { post_id: string }>(
    `select distinct on (c.post_id) c.post_id, c.id, c.parent_id, c.body, c.is_update, c.is_anonymous, c.created_at,
            p.id as user_id, p.display_name, p.handle
       from public.comments c
       join public.profiles p on p.id = c.user_id
       join public.posts po on po.id = c.post_id
       join public.profiles author on author.id = po.user_id
      where c.post_id = any($1::uuid[]) and c.moderation_status = 'visible' and c.parent_id is null
      order by c.post_id,
               (c.is_update and author.updates_in_first_comment) desc,
               case when c.is_update and author.updates_in_first_comment then c.created_at end desc,
               c.created_at asc`,
    [postIds],
  );
  const topByPost = new Map(tops.map((t) => [t.post_id, t]));
  const reach = await Promise.all(postIds.map((id) => tokens.reachOf(q, id)));
  const reachByPost = new Map(postIds.map((id, i) => [id, reach[i]!]));

  // The viewer's own active commitment on each post (vine tendrils, "Committed" state).
  const { rows: mine } = await q.query<{ post_id: string; id: string; frequency: string }>(
    `select post_id, id, frequency from public.commitments
      where user_id = $1 and status = 'active' and post_id = any($2::uuid[])`,
    [viewerId, postIds],
  );
  const myCommitment = new Map(mine.map((c) => [c.post_id, { id: c.id, frequency: c.frequency }]));

  // Each community's enabled reactions decide which actions its cards offer.
  const { rows: enabled } = await q.query<{ id: string; enabled_reactions: string[] }>(
    `select id, enabled_reactions::text[] as enabled_reactions from public.communities
      where id in (select community_id from public.posts where id = any($1::uuid[]))`,
    [postIds],
  );
  const actionsByCommunity = new Map(enabled.map((c) => [c.id, cardActions(c.enabled_reactions)]));

  const tiers = await tiersOf(q, [...new Set(rows.map((r) => r.user_id))]);
  // Tier icons: anonymous posts and anonymous members (private track) show a tier only to the author.
  const tierShown = (r: (typeof rows)[number]) =>
    (!r.is_anonymous && !r.private_tier) || r.user_id === viewerId ? (tiers.get(r.user_id)?.tier ?? null) : null;

  const byId = new Map(rows.map((r) => [r.id, r]));
  return postIds.flatMap((id) => {
    const r = byId.get(id);
    if (!r) return [];
    const top = topByPost.get(id);
    return [
      {
        id: r.id,
        author: {
          ...presentIdentity({ id: r.user_id, display_name: r.display_name, handle: r.handle }, r.is_anonymous, viewerId),
          tier: tierShown(r),
        },
        cardType: r.post_type as CardType,
        // Groups one person's posts (e.g. a personal vine branch) without exposing who; null when anonymous.
        branchKey: r.is_anonymous ? null : branchKey(r.user_id),
        isMine: r.user_id === viewerId,
        myCommitment: myCommitment.get(id) ?? null,
        actions: actionsByCommunity.get(r.community_id) ?? cardActions([]),
        postType: r.post_type,
        kind: r.kind,
        realm: r.realm,
        urgency: r.urgency,
        state: r.state,
        answeredAt: r.answered_at,
        ...preview(r.body),
        body: r.body,
        background: r.background,
        isSensitive: r.is_sensitive,
        media: r.media,
        counts: r.counts,
        reach: reachByPost.get(id) ?? 0,
        topComment: top ? presentComment(top, viewerId) : null,
        createdAt: r.created_at,
      },
    ];
  });
}

export type Card = Awaited<ReturnType<typeof cards>>[number];

/** Layout-neutral card kinds. Layouts (column, vine, ...) pick a template per kind. */
export type CardType = PostType | 'scripture_leaf' | 'feed_end';

/**
 * The labeled action row, in the same order on every card in every layout.
 * Prayer Cast stays out until the broadcast ships.
 */
export const ACTION_ORDER = ['praying_now', 'commit', 'encouragement', 'well_wishes', 'share', 'gift_tokens'] as const;
export type CardAction = (typeof ACTION_ORDER)[number];

function cardActions(enabledReactions: string[]): CardAction[] {
  const reactions = new Set(['encouragement', 'well_wishes', 'share']);
  return ACTION_ORDER.filter((a) => !reactions.has(a) || enabledReactions.includes(a));
}

export function branchKey(userId: string) {
  return createHash('sha256').update(`branch:${userId}`).digest('hex').slice(0, 16);
}

export async function metrics(q: Queryable, since: Date) {
  const { rows } = await q.query(
    `select count(*)::int as posts,
            count(*) filter (where post_type = 'prayer_request')::int as requests,
            count(*) filter (where state = 'answered')::int as answered,
            (select count(*)::int from public.comments where created_at >= $1) as comments,
            (select count(*)::int from public.reactions where created_at >= $1 and kind = 'encouragement') as encouragements
       from public.posts where created_at >= $1`,
    [since],
  );
  return rows[0];
}

/** Open requests from the given people that the member has not prayed for yet, newest first. */
export async function unprayedRequestsFrom(q: Queryable, userId: string, authorIds: string[], excludePostIds: string[]) {
  const { rows } = await q.query<{ id: string }>(
    `select p.id from public.posts p
      where p.user_id = any($2::uuid[]) and p.post_type = 'prayer_request' and p.moderation_status = 'visible'
        and p.state in ('open', 'actively_prayed') and not (p.id = any($3::uuid[]))
        and p.created_at > now() - interval '30 days'
        and not exists (select 1 from public.prayer_events e where e.post_id = p.id and e.user_id = $1)
      order by p.id desc limit 1`,
    [userId, authorIds, excludePostIds],
  );
  return rows[0] ?? null;
}

/** How a prompt names the person behind a post: their first name, or "this request" when anonymous. */
export async function promptSubject(q: Queryable, postId: string, viewerId: string) {
  const { rows } = await q.query<{ display_name: string; is_anonymous: boolean; user_id: string }>(
    'select pr.display_name, p.is_anonymous, p.user_id from public.posts p join public.profiles pr on pr.id = p.user_id where p.id = $1',
    [postId],
  );
  const r = rows[0];
  if (!r || (r.is_anonymous && r.user_id !== viewerId) || !r.display_name) return 'this request';
  return r.display_name;
}

/** A person's recent visible posts made under their name (never their anonymous ones). */
export async function namedPostIds(q: Queryable, authorId: string, limit = 20): Promise<string[]> {
  const { rows } = await q.query<{ id: string }>(
    `select id from public.posts
      where user_id = $1 and not is_anonymous and moderation_status = 'visible'
      order by id desc limit $2`,
    [authorId, limit],
  );
  return rows.map((r) => r.id);
}

export { MEDIA_BUCKET, signMedia } from './media.js';
