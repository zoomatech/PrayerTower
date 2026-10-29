// Posts module: prayer posts, media, comments, reactions (encouragement, well
// wishes, shares), thanks, the request state machine, and the post card.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { postParts } from '@prayer-tower/shared';
import { product } from '../../config.js';
import type { Queryable } from '../../db.js';
import { badRequest, forbidden, notFound } from '../../errors.js';
import { getProfile, presentIdentity, primaryCommunityId } from '../accounts/index.js';
import { badgesOf } from '../churches/index.js';
import { settings as conversationSettings } from '../conversation-helpers/index.js';
import * as moderation from '../moderation/index.js';
import * as harm from '../harm/index.js';
import * as safety from '../safety/index.js';
import * as skins from '../skins/index.js';
import { tiersOf } from '../tiers/index.js';
import * as tokens from '../tokens/index.js';

export const POST_TYPES = ['prayer_request', 'praise', 'open_prayer', 'testimony', 'confessional', 'discussion', 'news', 'blog'] as const;
// Kinds and realms of prayer (notebook Page 10) and text-post backgrounds; labels live in packages/shared.
export const PRAYER_KINDS = ['supplication', 'intercessory', 'praise_thanks'] as const;
export const PRAYER_REALMS = ['personal', 'family', 'church_community', 'general_welfare', 'national', 'world'] as const;
export const POST_BACKGROUNDS = ['dawn', 'sky', 'meadow', 'lavender', 'gold', 'night'] as const;
export type PostType = (typeof POST_TYPES)[number];
/** Discussion, news and blog posts aren't prayer requests: no Praying Now, promises, asks, radio or Power Prayer. */
export const DISCUSSION_TYPES: readonly PostType[] = ['discussion', 'news', 'blog'];
export function requirePrayable(post: { post_type: PostType }) {
  if (DISCUSSION_TYPES.includes(post.post_type)) throw badRequest('This is a discussion post, not a prayer request');
}
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
  /** "Prayer and positive thoughts welcome": support from people of any faith or none. */
  allSupportWelcome: z.boolean().default(false),
  /** A lament (grief or anguish): heard, not fixed. Only kept while the Lament switch is on. */
  isLament: z.boolean().optional(),
  /** The author's yes to a lament going out by radio. */
  lamentRadio: z.boolean().optional(),
  media: z
    // durationMs: the clip's length from the picker, checked against the video cap (modules/skins).
    .array(z.object({ kind: z.enum(['image', 'video']), storagePath: z.string().min(1).max(500), durationMs: z.number().int().min(0).max(86_400_000).optional() }))
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
  all_support_welcome: boolean;
  is_lament: boolean;
  lament_radio: boolean;
  /** "Prayer without ceasing" (radio/ceaseless.ts): the author keeps it on the air. */
  keep_on_air: boolean;
  answers_post_id: string | null;
  crisis: boolean;
  /** Set by the harmful-prayer check (modules/harm) until a moderator clears it. */
  harm_category: string | null;
  state: PostState;
  answered_at: Date | null;
  testimony: string | null;
  testimony_at: Date | null;
  moderation_status: ModerationStatus;
  community_id: string;
  created_at: Date;
}

export async function create(q: Queryable, userId: string, input: z.infer<typeof NewPost>): Promise<PostRow & { harm: harm.Guidance | null }> {
  await safety.checkNewMember(q, userId, 'post', input.body);
  await safety.checkFlood(q, userId, 'post', input.body);
  const harmDecision = await harm.screen(q, userId, 'post', input.body);
  const profile = await getProfile(q, userId);
  const isAnonymous = input.isAnonymous ?? profile?.anonymous_by_default ?? false;
  await skins.checkVideos(q, input.media);
  for (const m of input.media) {
    // Exactly the shape /media/upload-url hands out: <user id>/<uuid>.<ext>, no other folders.
    if (!m.storagePath.startsWith(`${userId}/`) || !/^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/.test(m.storagePath.slice(userId.length + 1))) throw badRequest('Media must be uploaded through /media/upload-url');
  }
  const communityId = await primaryCommunityId(q, userId);
  // Each community lists the post types it uses (Open Circle has no confessional posts).
  const { rowCount: typeAllowed } = await q.query('select 1 from public.communities where id = $1 and $2::public.post_type = any (enabled_post_types)', [
    communityId,
    input.postType,
  ]);
  if (!typeAllowed) throw badRequest('This kind of post is not available in your community');
  const { rows } = await q.query<PostRow>(
    `insert into public.posts (user_id, post_type, kind, realm, urgency, body, background, is_anonymous, is_sensitive, community_id, all_support_welcome, is_lament, lament_radio)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
             $12 and (select lament_enabled from public.practice_settings), $12 and $13 and (select lament_enabled from public.practice_settings)) returning *`,
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
      communityId,
      input.allSupportWelcome,
      input.isLament ?? false,
      input.lamentRadio ?? false,
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
  if (safety.mentionsCrisis(input.body) || (await harm.codedCrisis(q, input.body))) {
    await moderation.flagCrisis(q, 'post', post.id);
    post.crisis = true;
  }
  const harmGuidance = await harm.apply(q, userId, 'post', post.id, harmDecision);
  return { ...post, harm: harmGuidance };
}

export async function get(q: Queryable, postId: string): Promise<PostRow | null> {
  const { rows } = await q.query<PostRow>('select * from public.posts where id = $1', [postId]);
  return rows[0] ?? null;
}

export async function getVisible(q: Queryable, postId: string): Promise<PostRow | null> {
  const post = await get(q, postId);
  return post && post.moderation_status === 'visible' ? post : null;
}

/** True when either member has blocked the other. */
export async function blockedBetween(q: Queryable, a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const { rowCount } = await q.query(
    'select 1 from public.user_blocks where (user_id = $1 and blocked_id = $2) or (user_id = $2 and blocked_id = $1)',
    [a, b],
  );
  return !!rowCount;
}

/** True when the member belongs to the community. Communities are separate: Open Circle and the faith edition never mix. */
export async function inCommunity(q: Queryable, userId: string, communityId: string): Promise<boolean> {
  const { rowCount } = await q.query('select 1 from public.community_memberships where user_id = $1 and community_id = $2', [userId, communityId]);
  return !!rowCount;
}

/**
 * Praying across lines (switched off by default): a prayer request from another faith community
 * whose author and the viewer both opted in. Never Open Circle or any neutral-wording community.
 */
export async function acrossAllowed(q: Queryable, userId: string, post: PostRow): Promise<boolean> {
  if (post.post_type !== 'prayer_request' || post.is_sensitive || post.crisis) return false;
  const { rowCount } = await q.query(
    `select 1 from public.notebook_settings ns, public.communities pc, public.profiles a, public.profiles v
      where ns.cross_community_enabled and pc.id = $2 and public.community_is_faith(pc)
        and a.id = $3 and a.open_to_other_communities and v.id = $1 and v.open_to_other_communities and v.deleted_at is null
        and exists (select 1 from public.community_memberships m join public.communities c on c.id = m.community_id
                     where m.user_id = $1 and m.is_primary and c.id <> pc.id and public.community_is_faith(c))`,
    [userId, post.community_id, post.user_id],
  );
  return !!rowCount;
}

/** A visible post the member may read: their own, or one in a community they belong to. */
export async function getViewable(q: Queryable, userId: string, postId: string): Promise<PostRow | null> {
  const post = await getVisible(q, postId);
  if (!post) return null;
  return post.user_id === userId || (await inCommunity(q, userId, post.community_id)) || (await acrossAllowed(q, userId, post)) ? post : null;
}

/** A visible post the member may act on: only in their own communities, never one between people where either blocked the other. */
export async function getActionable(q: Queryable, userId: string, postId: string): Promise<PostRow | null> {
  const post = await getVisible(q, postId);
  if (!post || (await blockedBetween(q, userId, post.user_id))) return null;
  return post.user_id === userId || (await inCommunity(q, userId, post.community_id)) || (await acrossAllowed(q, userId, post)) ? post : null;
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
  // Conditional, so two taps at once can't both mark it (and tell everyone twice).
  const { rows } = await q.query<PostRow>(
    `update public.posts set state = 'answered', answered_at = now() where id = $1 and state <> 'answered' returning *`,
    [postId],
  );
  if (!rows[0]) throw badRequest('This post is already answered');
  return rows[0];
}

// Testimonies ------------------------------------------------------------------

export const Testimony = z.object({ body: z.string().trim().min(1).max(2000) });

/**
 * The poster tells what God did, on an answered request. Editing keeps the
 * first testimony time. It is scanned like any post text. Returns whether this
 * is the first testimony (so pray-ers are told once) and whether it mentions crisis.
 */
export async function setTestimony(q: Queryable, userId: string, postId: string, input: z.infer<typeof Testimony>) {
  const post = await get(q, postId);
  if (!post || post.moderation_status === 'removed') throw notFound('Post');
  if (post.user_id !== userId) throw forbidden('Only the poster can add a testimony');
  if (post.state !== 'answered') throw badRequest('Mark the request answered first');
  await safety.checkNewMember(q, userId, 'post', input.body);
  const harmDecision = await harm.screen(q, userId, 'post', input.body);
  await q.query(`update public.posts set testimony = $2, testimony_at = coalesce(testimony_at, now()) where id = $1`, [postId, input.body]);
  await moderation.queueScan(q, 'post', postId);
  const crisis = safety.mentionsCrisis(input.body) || (await harm.codedCrisis(q, input.body));
  if (crisis) await moderation.flagCrisis(q, 'post', postId);
  await harm.apply(q, userId, 'post', postId, harmDecision);
  return { post, first: post.testimony === null, crisis };
}

export async function removeTestimony(q: Queryable, userId: string, postId: string) {
  const { rowCount } = await q.query(`update public.posts set testimony = null, testimony_at = null where id = $1 and user_id = $2`, [postId, userId]);
  if (!rowCount) throw notFound('Post');
}

export const LamentPatch = z.object({ lament: z.boolean().optional(), radio: z.boolean().optional() });

/** The author marks or unmarks a lament, and says yes or no to radio. Off with the Lament switch. */
export async function setLament(q: Queryable, userId: string, postId: string, p: z.infer<typeof LamentPatch>) {
  const { rows: s } = await q.query<{ on: boolean }>('select lament_enabled as on from public.practice_settings');
  if (!s[0]?.on) throw badRequest('Lament posts are switched off');
  const { rows } = await q.query<{ is_lament: boolean; lament_radio: boolean }>(
    `update public.posts set is_lament = coalesce($3, is_lament),
            lament_radio = coalesce($3, is_lament) and coalesce($4, lament_radio)
      where id = $1 and user_id = $2 returning is_lament, lament_radio`,
    [postId, userId, p.lament ?? null, p.radio ?? null],
  );
  if (!rows[0]) throw notFound('Post');
  return { lament: rows[0].is_lament, lamentRadio: rows[0].lament_radio };
}

/** Everyone who prayed for or committed to a request, except its poster and anyone on either side of a block with them. */
export async function prayedBy(q: Queryable, postId: string, posterId: string): Promise<string[]> {
  const { rows } = await q.query<{ user_id: string }>(
    `select distinct user_id from (
       select user_id from public.prayer_events where post_id = $1
       union select user_id from public.commitments where post_id = $1
     ) s where user_id <> $2
         and not exists (select 1 from public.user_blocks b
                          where (b.user_id = $2 and b.blocked_id = s.user_id) or (b.user_id = s.user_id and b.blocked_id = $2))`,
    [postId, posterId],
  );
  return rows.map((r) => r.user_id);
}

/**
 * The poster deletes their own request. It's erased with its comments, prayers
 * and media, unless the token ledger points at it (tokens were given to it);
 * then it's emptied and taken down instead. Returns media paths to remove.
 */
export async function remove(q: Queryable, userId: string, postId: string): Promise<string[]> {
  const post = await get(q, postId);
  if (!post || post.user_id !== userId) throw notFound('Post');
  const { rows: media } = await q.query<{ storage_path: string }>('select storage_path from public.post_media where post_id = $1', [postId]);
  const { rowCount } = await q.query(
    `delete from public.posts p where p.id = $1 and not exists (select 1 from public.token_accounts a where a.post_id = p.id)`,
    [postId],
  );
  if (!rowCount) {
    await q.query(`update public.posts set body = '(deleted)', testimony = null, moderation_status = 'removed' where id = $1`, [postId]);
    await q.query('delete from public.post_media where post_id = $1', [postId]);
  }
  return media.map((m) => m.storage_path);
}

/** The author deletes their comment. Replies from others stay, under a "(deleted)" placeholder. */
export async function removeComment(q: Queryable, userId: string, commentId: string) {
  const { rows } = await q.query<{ user_id: string }>('select user_id from public.comments where id = $1', [commentId]);
  if (!rows[0] || rows[0].user_id !== userId) throw notFound('Comment');
  const { rowCount } = await q.query(
    `delete from public.comments c where c.id = $1 and not exists (select 1 from public.comments r where r.parent_id = c.id)`,
    [commentId],
  );
  if (!rowCount) await q.query(`update public.comments set body = '(deleted)' where id = $1`, [commentId]);
}

export async function setModerationStatus(q: Queryable, target: moderation.Target, id: string, status: ModerationStatus) {
  const table = { post: 'posts', comment: 'comments', reaction: 'reactions', message: 'messages', event: 'events', spoken_prayer: 'spoken_prayers' }[target];
  await q.query(`update public.${table} set moderation_status = $2 where id = $1`, [id, status]);
}

/** Show content again that was hidden pending review; content already removed stays removed. */
/** Shows content a flag hid until a person decided. True when it was hidden and is now back up. */
export async function unhide(q: Queryable, target: moderation.Target, id: string) {
  const table = { post: 'posts', comment: 'comments', reaction: 'reactions', message: 'messages', event: 'events', spoken_prayer: 'spoken_prayers' }[target];
  const { rowCount } = await q.query(`update public.${table} set moderation_status = 'visible' where id = $1 and moderation_status = 'hidden_pending_review'`, [id]);
  return !!rowCount;
}

/** The author and text of any moderatable item. */
export async function moderationSubject(q: Queryable, target: moderation.Target, id: string) {
  const sql = {
    post: `select user_id, community_id, body || coalesce(E'\n' || testimony, '') as text from public.posts where id = $1`,
    comment: 'select user_id, community_id, body as text from public.comments where id = $1',
    reaction: 'select user_id, community_id, note as text from public.reactions where id = $1',
    message: 'select user_id, community_id, body as text from public.messages where id = $1',
    event: `select created_by as user_id, community_id, title || E'\n' || description || coalesce(E'\n' || location, '') as text from public.events where id = $1`,
    spoken_prayer: `select user_id, community_id, '[Spoken prayer]' as text from public.spoken_prayers where id = $1`,
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
  /** Comments at block breaks: which part of a long post this is about. Ignored while the switch is off. */
  part: z.number().int().min(0).max(1000).optional(),
});

/** The part a new comment may carry: only a top-level comment, on a part the post has, with the switch on. */
async function commentPart(q: Queryable, post: PostRow, input: z.infer<typeof NewComment>) {
  if (input.part === undefined || !(await conversationSettings(q)).part_comments_enabled) return null;
  if (input.parentId || input.isUpdate) throw badRequest('Only a new comment can be about one part');
  if (input.part >= postParts(post.body).length) throw badRequest('That part is not in this post');
  return input.part;
}

export async function addComment(q: Queryable, userId: string, postId: string, input: z.infer<typeof NewComment>) {
  const post = await getActionable(q, userId, postId);
  if (!post) throw notFound('Post');
  if (input.isUpdate && post.user_id !== userId) throw forbidden('Only the poster can add an update');
  if (input.parentId) {
    const { rowCount } = await q.query('select 1 from public.comments where id = $1 and post_id = $2', [input.parentId, postId]);
    if (!rowCount) throw badRequest('Reply target is not on this post');
    await skins.checkReplyDepth(q, input.parentId);
  }
  const part = await commentPart(q, post, input);
  await safety.checkNewMember(q, userId, 'comment', input.body);
  await safety.checkFlood(q, userId, 'comment', input.body);
  const harmDecision = await harm.screen(q, userId, 'comment', input.body);
  const isAnonymous = input.isAnonymous ?? (input.isUpdate ? post.is_anonymous : false);
  const { rows } = await q.query<{ id: string }>(
    `insert into public.comments (post_id, user_id, parent_id, body, is_update, is_anonymous, part)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [postId, userId, input.parentId ?? null, input.body, input.isUpdate, isAnonymous, part],
  );
  await moderation.queueScan(q, 'comment', rows[0]!.id);
  const crisis = safety.mentionsCrisis(input.body) || (await harm.codedCrisis(q, input.body));
  if (crisis) await moderation.flagCrisis(q, 'comment', rows[0]!.id);
  const harmGuidance = await harm.apply(q, userId, 'comment', rows[0]!.id, harmDecision);
  return { ...rows[0]!, crisis, harm: harmGuidance };
}

interface CommentRow {
  id: string;
  parent_id: string | null;
  body: string;
  is_update: boolean;
  is_anonymous: boolean;
  part: number | null;
  created_at: Date;
  user_id: string;
  display_name: string;
  handle: string | null;
}

/** Most comments a feed card brings for the drawn vine; the rest are on the post page. */
const FEED_LEAVES = 3;

const commentSelect = `select c.id, c.parent_id, c.body, c.is_update, c.is_anonymous, c.part, c.created_at,
                              p.id as user_id, p.display_name, p.handle
                         from public.comments c join public.profiles p on p.id = c.user_id`;

function presentComment(c: CommentRow, viewerId: string | null) {
  return {
    id: c.id,
    parentId: c.parent_id,
    body: c.body,
    isUpdate: c.is_update,
    part: c.part,
    createdAt: c.created_at,
    isMine: c.user_id === viewerId,
    author: presentIdentity({ id: c.user_id, display_name: c.display_name, handle: c.handle }, c.is_anonymous, viewerId),
  };
}

/** Comments in thread order: each reply follows its parent, with its depth for indenting. */
export async function listComments(q: Queryable, postId: string, viewerId: string | null) {
  // Comments from anyone the viewer blocked or muted are left out.
  const { rows } = await q.query<CommentRow>(
    `${commentSelect} where c.post_id = $1 and c.moderation_status = 'visible'
       and not exists (select 1 from public.user_blocks b where b.user_id = $2 and b.blocked_id = c.user_id)
       and not exists (select 1 from public.user_mutes mu where mu.user_id = $2 and mu.muted_id = c.user_id)
     order by c.id`,
    [postId, viewerId],
  );
  const ids = new Set(rows.map((r) => r.id));
  const children = new Map<string | null, CommentRow[]>();
  for (const c of rows) {
    const key = c.parent_id && ids.has(c.parent_id) ? c.parent_id : null;
    const list = children.get(key);
    if (list) list.push(c);
    else children.set(key, [c]);
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
  const post = await getActionable(q, userId, postId);
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
  const post = await getActionable(q, senderId, postId);
  if (!post) throw notFound('Post');
  requirePrayable(post);
  await safety.checkNewMember(q, senderId, 'ask');
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
  // Sensitive requests skip anyone who opted out of trauma-related content; nobody who blocked
  // (or was blocked by) the sender or the poster is asked, and only people in the post's community.
  const { rows: recipients } = await q.query<{ id: string }>(
    `select p.id from public.profiles p
      where p.id = any($1::uuid[]) and p.deleted_at is null and not ($2 and p.trauma_content_opt_out)
        and exists (select 1 from public.community_memberships m where m.user_id = p.id and m.community_id = $4)
        and not exists (select 1 from public.user_blocks b
                         where (b.user_id = p.id and b.blocked_id = any($3::uuid[])) or (b.blocked_id = p.id and b.user_id = any($3::uuid[])))`,
    [rows.map((r) => r.id), post.is_sensitive, [senderId, post.user_id], post.community_id],
  );
  const sender = await getProfile(q, senderId);
  const hidden = post.user_id === senderId && post.is_anonymous;
  const senderName = hidden ? 'Someone' : (sender?.display_name ?? 'Someone');
  // "Carol in Albuquerque", only for recipients in the post's community (townsFor checks the switch).
  const names = new Map<string, string>();
  if (!hidden) {
    for (const r of recipients) {
      const town = (await townsFor(q, [{ postId: post.id, communityId: post.community_id, userId: senderId }], r.id)).get(post.id);
      if (town) names.set(r.id, `${senderName} in ${town}`);
    }
  }
  return {
    recipients: recipients.map((r) => r.id),
    senderName,
    nameFor: (id: string) => names.get(id) ?? senderName,
    preview: post.body.slice(0, 120),
  };
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
  const picked = input.recipientIds && new Set(input.recipientIds);
  const recipients = (await prayedBy(q, postId, userId)).filter((id) => !picked || picked.has(id));
  for (const r of recipients) {
    await q.query('insert into public.thanks (post_id, user_id, recipient_id, icon, message) values ($1, $2, $3, $4, $5)', [
      postId,
      userId,
      r,
      input.icon,
      input.message ?? null,
    ]);
  }
  return { post, recipients };
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
  /** Quick reactions (long-press), counted whether or not the tray is switched on. */
  candles: number;
  standing: number;
}

/** Build post cards for a viewer, in the order given. */
export async function cards(q: Queryable, postIds: string[], viewerId: string | null) {
  if (postIds.length === 0) return [];
  const { rows } = await q.query<
    PostRow & {
      display_name: string;
      handle: string | null;
      private_tier: boolean;
      counts: CardCounts;
      media: { kind: string; storagePath: string }[];
      answers: { id: string; preview: string } | null;
      story_id: string | null;
      counts_quiet: boolean;
    }
  >(
    `select po.*, pr.display_name, pr.handle, pr.anonymous_by_default as private_tier,
            json_build_object(
              'prayingNow', (select count(*) from public.prayer_events e where e.post_id = po.id and e.kind = 'praying_now'),
              'prayers', (select count(distinct e.user_id) from public.prayer_events e where e.post_id = po.id),
              'commitments', (select count(*) from public.commitments c where c.post_id = po.id and c.status <> 'cancelled'),
              'encouragements', (select count(*) from public.reactions r where r.post_id = po.id and r.kind = 'encouragement' and r.moderation_status = 'visible'),
              'wellWishes', (select count(*) from public.reactions r where r.post_id = po.id and r.kind = 'well_wishes'),
              'shares', (select count(*) from public.reactions r where r.post_id = po.id and r.kind = 'share'),
              'comments', (select count(*) from public.comments c where c.post_id = po.id and c.moderation_status = 'visible'),
              'candles', (select count(*) from public.quick_reactions x where x.post_id = po.id and x.kind = 'candle'),
              'standing', (select count(*) from public.quick_reactions x where x.post_id = po.id and x.kind = 'standing')
            ) as counts,
            coalesce((select json_agg(json_build_object('kind', m.kind, 'storagePath', m.storage_path) order by m.position)
                        from public.post_media m where m.post_id = po.id), '[]') as media,
            -- "Prayer answered" stories: the request a story answers, and a request's story.
            (select json_build_object('id', o.id, 'preview', left(o.body, 120)) from public.posts o
              where o.id = po.answers_post_id and o.moderation_status = 'visible') as answers,
            (select s.id from public.posts s where s.answers_post_id = po.id and s.moderation_status = 'visible') as story_id,
            coalesce((select qp.hide_mine from public.quiet_count_prefs qp where qp.user_id = po.user_id), false) as counts_quiet
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

  // Drawn vine (Admin → Feed skins → comments as leaves): each card brings its newest few
  // comments, so they can spread outward and downward from the post toward the next one.
  const leavesByPost = new Map<string, CommentRow[]>();
  const { rows: tree } = await q.query<{ on: boolean; n: number }>(
    'select skins_enabled and comment_tree_enabled as on, least(comment_tree_leaves, $1)::int as n from public.skin_settings',
    [FEED_LEAVES],
  );
  if (tree[0]?.on) {
    const { rows: recent } = await q.query<CommentRow & { post_id: string }>(
      `select * from (
         select c.post_id, c.id, c.parent_id, c.body, c.is_update, c.is_anonymous, c.created_at,
                p.id as user_id, p.display_name, p.handle,
                row_number() over (partition by c.post_id order by c.created_at desc, c.id desc) as n
           from public.comments c join public.profiles p on p.id = c.user_id
          where c.post_id = any($1::uuid[]) and c.moderation_status = 'visible'
            and not exists (select 1 from public.user_blocks b where b.user_id = $2 and b.blocked_id = c.user_id)) x
        where x.n <= $3
        order by x.post_id, x.created_at desc, x.id desc`,
      [postIds, viewerId, tree[0].n],
    );
    for (const c of recent) {
      const list = leavesByPost.get(c.post_id);
      if (list) list.push(c);
      else leavesByPost.set(c.post_id, [c]);
    }
  }
  // One query, not one per card: parallel per-card queries took every pool connection (load test 2026-10-28).
  const reachByPost = await tokens.reachOfMany(q, postIds);
  // Posts copied from the author's Facebook or Threads ("From Facebook").
  const { rows: copies } = await q.query<{ post_id: string; source: 'facebook' | 'threads' }>(
    'select post_id, source from public.crosspost_imports where post_id = any($1::uuid[])',
    [postIds],
  );
  const copiedFrom = new Map(copies.map((c) => [c.post_id, c.source]));

  // The viewer's own active commitment on each post (vine tendrils, "Committed" state).
  const { rows: mine } = await q.query<{ post_id: string; id: string; frequency: string }>(
    `select post_id, id, frequency from public.commitments
      where user_id = $1 and status = 'active' and post_id = any($2::uuid[])`,
    [viewerId, postIds],
  );
  const myCommitment = new Map(mine.map((c) => [c.post_id, { id: c.id, frequency: c.frequency }]));

  // The viewer's own quick reactions ("Light a candle", "Standing with you").
  const { rows: quick } = await q.query<{ post_id: string; kinds: string[] }>(
    `select post_id, array_agg(kind order by kind) as kinds from public.quick_reactions
      where user_id = $1 and post_id = any($2::uuid[]) group by post_id`,
    [viewerId, postIds],
  );
  const myQuick = new Map(quick.map((r) => [r.post_id, r.kinds]));

  // Towns ("Carol in Albuquerque"), while switched on: only when the viewer and the
  // author are both members of the post's community, never on an anonymous post.
  const towns = await townsFor(q, rows.filter((r) => !r.is_anonymous).map((r) => ({ postId: r.id, communityId: r.community_id, userId: r.user_id })), viewerId);

  // Each community's enabled reactions decide which actions its cards offer.
  const { rows: enabled } = await q.query<{ id: string; enabled_reactions: string[] }>(
    `select id, enabled_reactions::text[] as enabled_reactions from public.communities
      where id in (select community_id from public.posts where id = any($1::uuid[]))`,
    [postIds],
  );
  const actionsByCommunity = new Map(enabled.map((c) => [c.id, cardActions(c.enabled_reactions)]));

  const authorIds = [...new Set(rows.map((r) => r.user_id))];
  const tiers = await tiersOf(q, authorIds);
  // Verified pastors' badge ("Pastor · Grace Chapel"), never on an anonymous post.
  const pastors = await badgesOf(q, authorIds);
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
          pastor: r.is_anonymous ? null : (pastors.get(r.user_id) ?? null),
          ...(towns.has(r.id) ? { town: towns.get(r.id)! } : {}),
        },
        cardType: r.post_type as CardType,
        // Groups one person's posts (e.g. a personal vine branch) without exposing who; null when anonymous.
        branchKey: r.is_anonymous ? null : branchKey(r.user_id),
        isMine: r.user_id === viewerId,
        myCommitment: myCommitment.get(id) ?? null,
        myQuickReactions: myQuick.get(id) ?? [],
        actions: (actionsByCommunity.get(r.community_id) ?? cardActions([])).filter(
          (a) => !DISCUSSION_TYPES.includes(r.post_type) || (a !== 'praying_now' && a !== 'commit'),
        ),
        postType: r.post_type,
        kind: r.kind,
        realm: r.realm,
        urgency: r.urgency,
        state: r.state,
        answeredAt: r.answered_at,
        testimony: r.testimony,
        testimonyAt: r.testimony_at,
        ...preview(r.body),
        body: r.body,
        background: r.background,
        isSensitive: r.is_sensitive,
        allSupportWelcome: r.all_support_welcome,
        lament: r.is_lament,
        lamentRadio: r.lament_radio,
        ...(r.user_id === viewerId ? { keepOnAir: r.keep_on_air } : {}),
        answers: r.answers,
        storyId: r.story_id,
        countsQuiet: r.counts_quiet,
        crisis: r.crisis,
        media: r.media,
        counts: r.counts,
        reach: reachByPost.get(id) ?? 0,
        topComment: top ? presentComment(top, viewerId) : null,
        crosspostedFrom: copiedFrom.get(id) ?? null,
        ...(leavesByPost.size ? { leafComments: (leavesByPost.get(id) ?? []).map((c) => presentComment(c, viewerId)) } : {}),
        createdAt: r.created_at,
      },
    ];
  });
}

/**
 * Each post's author town, keyed by post id, when the "Town on profiles" switch is on and
 * the viewer and the author both belong to the post's community. Empty while switched off.
 */
export async function townsFor(q: Queryable, items: { postId: string; communityId: string; userId: string }[], viewerId: string | null) {
  const out = new Map<string, string>();
  if (items.length === 0 || !viewerId) return out;
  const { rows: on } = await q.query<{ on: boolean }>('select member_town_enabled as on from public.notebook_settings');
  if (!on[0]?.on) return out;
  const { rows } = await q.query<{ post_id: string; town: string }>(
    `select i.post_id, p.town
       from unnest($1::uuid[], $2::uuid[], $3::uuid[]) as i(post_id, community_id, user_id)
       join public.profiles p on p.id = i.user_id and p.town is not null and p.deleted_at is null
      where exists (select 1 from public.community_memberships m where m.community_id = i.community_id and m.user_id = i.user_id)
        and exists (select 1 from public.community_memberships m where m.community_id = i.community_id and m.user_id = $4)`,
    [items.map((i) => i.postId), items.map((i) => i.communityId), items.map((i) => i.userId), viewerId],
  );
  for (const r of rows) out.set(r.post_id, r.town);
  return out;
}

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
        and exists (select 1 from public.community_memberships m where m.user_id = $1 and m.community_id = p.community_id)
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
/** The author's named posts the viewer may see: only in the viewer's communities, unless it's their own page. */
export async function namedPostIds(q: Queryable, authorId: string, viewerId: string, limit = 20): Promise<string[]> {
  const { rows } = await q.query<{ id: string }>(
    `select id from public.posts
      where user_id = $1 and not is_anonymous and moderation_status = 'visible'
        and ($1 = $3 or community_id in (select community_id from public.community_memberships where user_id = $3))
      order by id desc limit $2`,
    [authorId, limit, viewerId],
  );
  return rows.map((r) => r.id);
}

export { signMedia } from './media.js';
