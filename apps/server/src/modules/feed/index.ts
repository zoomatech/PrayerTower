// Feed module: V1 single-column feed, fan-out on read. Posts are stored once
// and ranked at read time. All ranking weights live in rankFeed() so they
// change in one place. A member sees posts from the communities they belong
// to (V1: one Christian ecumenical community).
import { FEED_MIX_MULTIPLIER, type FeedMix, type FeedMixKey } from '@prayer-tower/shared';
import type { Queryable } from '../../db.js';
import { notFound } from '../../errors.js';
import { communityIds, getProfile } from '../accounts/index.js';
import * as macroNeeds from '../macro-needs/index.js';
import * as posts from '../posts/index.js';
import * as skins from '../skins/index.js';

export interface Candidate {
  id: string;
  postType: posts.PostType;
  realm: string | null;
  createdAt: Date;
  urgency: number;
  followed: boolean;
  commitments: number;
  prayingNowTaps: number;
  reach: number;
  /** The viewer's own post: never pinned as "Pray for this first". */
  mine?: boolean;
}

export const weights = {
  recencyHalfLifeHours: 24,
  followed: 1,
  /** Commitments are worth more than ephemeral taps: five outrank fifty Praying Now taps (Business Plan 3.3). */
  commitment: 12,
  prayingNowTap: 1,
  engagement: 0.15,
  reach: 0.1,
  urgency: 0.05,
};

export function score(c: Candidate, now: Date): number {
  const ageHours = Math.max(0, (now.getTime() - c.createdAt.getTime()) / 3_600_000);
  const recency = Math.pow(0.5, ageHours / weights.recencyHalfLifeHours);
  const engagement = weights.commitment * c.commitments + weights.prayingNowTap * c.prayingNowTaps;
  return (
    recency *
      (1 +
        (c.followed ? weights.followed : 0) +
        weights.engagement * Math.log1p(engagement) +
        weights.reach * Math.log1p(c.reach)) +
    weights.urgency * c.urgency
  );
}

/** The member's "Pick Your Prayer Mix" multiplier for a post: type and realm levels multiply. */
export function mixMultiplier(c: Pick<Candidate, 'postType' | 'realm'>, mix: FeedMix): number {
  const level = (key: string) => FEED_MIX_MULTIPLIER[mix[key as FeedMixKey] ?? 'normal'];
  return level(`type:${c.postType}`) * (c.realm ? level(`realm:${c.realm}`) : 1);
}

/**
 * Order candidates. Ranking never removes a post: every visible request keeps
 * baseline visibility no matter how many tokens anyone spent or how a member
 * sets their mix.
 */
export function rankFeed(candidates: Candidate[], now = new Date(), mix: FeedMix = {}): Candidate[] {
  const s = new Map(candidates.map((c) => [c.id, score(c, now) * mixMultiplier(c, mix)]));
  return [...candidates].sort((a, b) => s.get(b.id)! - s.get(a.id)! || (a.id < b.id ? 1 : -1));
}

/** The first post on open: the most recent prayer request or thanksgiving. */
export function pickPinned(candidates: Candidate[]): Candidate | null {
  return (
    candidates
      .filter((c) => !c.mine && (c.postType === 'prayer_request' || c.postType === 'praise'))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
  );
}

const CANDIDATE_WINDOW_DAYS = 30;
const CANDIDATE_LIMIT = 500;

async function candidates(q: Queryable, viewerId: string): Promise<Candidate[]> {
  const viewer = await getProfile(q, viewerId);
  const communities = await communityIds(q, viewerId);
  const { rows } = await q.query<{
    id: string;
    post_type: posts.PostType;
    realm: string | null;
    created_at: Date;
    urgency: number;
    followed: boolean;
    commitments: number;
    taps: number;
    reach: string | null;
    mine: boolean;
  }>(
    `select p.id, p.post_type, p.realm, p.created_at, p.urgency, p.user_id = $1 as mine,
            exists (select 1 from public.follows f where f.user_id = $1 and f.followee_id = p.user_id) as followed,
            (select count(*)::int from public.commitments c where c.post_id = p.id and c.status <> 'cancelled') as commitments,
            (select count(*)::int from public.prayer_events e where e.post_id = p.id and e.kind = 'praying_now') as taps,
            (select balance from public.token_accounts a where a.kind = 'post_reach' and a.post_id = p.id) as reach
       from public.posts p
      where p.moderation_status = 'visible'
        and p.created_at > now() - make_interval(days => $2)
        and (not $3 or not p.is_sensitive)
        and p.community_id = any($5::uuid[])
        and not exists (select 1 from public.user_blocks b
                         where (b.user_id = $1 and b.blocked_id = p.user_id) or (b.user_id = p.user_id and b.blocked_id = $1))
        and not exists (select 1 from public.hidden_posts h where h.user_id = $1 and h.post_id = p.id)
        and not exists (select 1 from public.user_mutes mu where mu.user_id = $1 and mu.muted_id = p.user_id)
      order by p.created_at desc
      limit $4`,
    [viewerId, CANDIDATE_WINDOW_DAYS, viewer?.trauma_content_opt_out ?? false, CANDIDATE_LIMIT, communities],
  );
  return rows.map((r) => ({
    id: r.id,
    postType: r.post_type,
    realm: r.realm,
    createdAt: r.created_at,
    urgency: r.urgency,
    followed: r.followed,
    commitments: r.commitments,
    prayingNowTaps: r.taps,
    reach: Number(r.reach ?? 0),
    mine: r.mine,
  }));
}

export interface FeedTheme {
  slug: string;
  name: string;
  layout: 'column' | 'vine' | 'carousel' | 'flip' | 'wall' | 'tower' | 'circuit' | 'ceramic';
  cardTemplates: Record<string, unknown>;
  animations: Record<string, unknown>;
  tokens: Record<string, unknown>;
}

/** The viewer's chosen theme in their primary community, else that community's default. */
export async function theme(q: Queryable, viewerId: string, now = new Date()): Promise<FeedTheme | null> {
  // The member's own choice while it can show; else this season's skin when an admin has
  // "use the season's skin" on and the member never chose one; else the community default.
  const { rows } = await q.query<FeedTheme>(
    `select t.slug, t.name, t.layout, t.card_templates as "cardTemplates", t.animations, t.tokens
       from public.community_memberships m
       join lateral (
         select t.*, 0 as rank from public.feed_themes t where t.id = m.feed_theme_id
         union all
         select t.*, 1 from public.community_feed_themes d join public.feed_themes t on t.id = d.theme_id
          where d.community_id = m.community_id and m.feed_theme_id is null and t.season is not null
            and (select seasonal_auto from public.skin_settings)
         union all
         select t.*, 2 from public.community_feed_themes d join public.feed_themes t on t.id = d.theme_id
          where d.community_id = m.community_id and d.is_default
       ) t on ${skins.themeVisible('$2')}
      where m.user_id = $1
      order by m.is_primary desc, t.rank
      limit 1`,
    [viewerId, skins.seasonsNow(now)],
  );
  return rows[0] ?? null;
}

/** Feed styles offered in the member's primary community, and which one they use. */
export async function themeChoices(q: Queryable, viewerId: string, now = new Date()) {
  const { rows } = await q.query<{ slug: string; name: string; layout: string; status: string; is_default: boolean; chosen: boolean; season: string | null }>(
    `select t.slug, t.name, t.layout, t.status, d.is_default, (m.feed_theme_id = t.id) as chosen, t.season
       from public.community_memberships m
       join public.community_feed_themes d on d.community_id = m.community_id
       join public.feed_themes t on t.id = d.theme_id
      where m.user_id = $1 and m.is_primary and ${skins.themeVisible('$2')}
     union
     -- Skins the member made themselves (theme maker), before or after an admin shares them.
     select t.slug, t.name, t.layout, t.status, false as is_default, (m.feed_theme_id = t.id) as chosen, t.season
       from public.community_memberships m
       join public.feed_themes t on t.owner_id = m.user_id
      where m.user_id = $1 and m.is_primary and ${skins.themeVisible('$2')}
        and not exists (select 1 from public.community_feed_themes d where d.community_id = m.community_id and d.theme_id = t.id)
      order by is_default desc, season nulls last, name`,
    [viewerId, skins.seasonsNow(now)],
  );
  const current = rows.find((r) => r.chosen) ?? rows.find((r) => r.is_default);
  // The full current theme too, so screens outside the feed (comment trees) can use its colors.
  return { themes: rows.map(({ chosen: _c, ...t }) => t), current: current?.slug ?? null, theme: await theme(q, viewerId, now) };
}

/** Choose a feed style offered in the primary community; null returns to the community default. */
export async function chooseTheme(q: Queryable, viewerId: string, slug: string | null, now = new Date()) {
  const { rowCount } = await q.query(
    `update public.community_memberships m
        set feed_theme_id = case when $2::text is null then null else (
          select t.id from public.community_feed_themes d join public.feed_themes t on t.id = d.theme_id
           where d.community_id = m.community_id and t.slug = $2 and ${skins.themeVisible('$3')}
          union all
          select t.id from public.feed_themes t where t.owner_id = $1 and t.slug = $2 and ${skins.themeVisible('$3')}
          limit 1) end
      where m.user_id = $1 and m.is_primary
        and ($2::text is null or exists (
          select 1 from public.community_feed_themes d join public.feed_themes t on t.id = d.theme_id
           where d.community_id = m.community_id and t.slug = $2 and ${skins.themeVisible('$3')})
        or exists (select 1 from public.feed_themes t where t.owner_id = $1 and t.slug = $2 and ${skins.themeVisible('$3')}))`,
    [viewerId, slug, skins.seasonsNow(now)],
  );
  if (!rowCount) throw notFound('Feed style');
  return themeChoices(q, viewerId, now);
}

export const FEED_FILTERS = ['all', 'testimonies'] as const;
export type FeedFilter = (typeof FEED_FILTERS)[number];

/**
 * Testimonies: answered requests with the poster's testimony, and testimony
 * posts, newest first, from the past year. Same visibility rules as the feed.
 */
async function testimonyIds(q: Queryable, viewerId: string): Promise<string[]> {
  const viewer = await getProfile(q, viewerId);
  const communities = await communityIds(q, viewerId);
  const { rows } = await q.query<{ id: string }>(
    `select p.id from public.posts p
      where p.moderation_status = 'visible'
        and (p.testimony is not null or p.post_type = 'testimony')
        and coalesce(p.testimony_at, p.created_at) > now() - interval '365 days'
        and (not $2 or not p.is_sensitive)
        and p.community_id = any($3::uuid[])
        and not exists (select 1 from public.user_blocks b
                         where (b.user_id = $1 and b.blocked_id = p.user_id) or (b.user_id = p.user_id and b.blocked_id = $1))
        and not exists (select 1 from public.hidden_posts h where h.user_id = $1 and h.post_id = p.id)
        and not exists (select 1 from public.user_mutes mu where mu.user_id = $1 and mu.muted_id = p.user_id)
      order by coalesce(p.testimony_at, p.created_at) desc
      limit $4`,
    [viewerId, viewer?.trauma_content_opt_out ?? false, communities, CANDIDATE_LIMIT],
  );
  return rows.map((r) => r.id);
}

export async function getFeed(q: Queryable, viewerId: string, page = 0, pageSize = 20, filter: FeedFilter = 'all') {
  if (filter === 'testimonies') {
    const ids = await testimonyIds(q, viewerId);
    return {
      theme: page === 0 ? await theme(q, viewerId) : undefined,
      posts: await posts.cards(q, ids.slice(page * pageSize, (page + 1) * pageSize), viewerId),
      pinnedId: null,
      nextPage: (page + 1) * pageSize < ids.length ? page + 1 : null,
    };
  }
  // Featured Macro Needs show above the feed, so they aren't repeated in it.
  const featured = new Set(await macroNeeds.featuredPostIds(q, viewerId));
  const all = (await candidates(q, viewerId)).filter((c) => !featured.has(c.id));
  const pinned = pickPinned(all);
  const mix = (await getProfile(q, viewerId))?.feed_mix ?? {};
  const ranked = rankFeed(all.filter((c) => c.id !== pinned?.id), new Date(), mix);
  const ordered = pinned ? [pinned, ...ranked] : ranked;
  const slice = ordered.slice(page * pageSize, (page + 1) * pageSize);
  return {
    // Cards carry no layout; the client renders them with the theme's layout.
    theme: page === 0 ? await theme(q, viewerId) : undefined,
    posts: await posts.cards(q, slice.map((c) => c.id), viewerId),
    pinnedId: page === 0 ? (pinned?.id ?? null) : null,
    nextPage: (page + 1) * pageSize < ordered.length ? page + 1 : null,
  };
}
