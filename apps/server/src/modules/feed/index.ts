// Feed module: V1 single-column feed, fan-out on read. Posts are stored once
// and ranked at read time. All ranking weights live in rankFeed() so they
// change in one place. A member sees posts from the communities they belong
// to (V1: one Christian ecumenical community).
import type { Queryable } from '../../db.js';
import { notFound } from '../../errors.js';
import { communityIds, getProfile } from '../accounts/index.js';
import * as posts from '../posts/index.js';

export interface Candidate {
  id: string;
  postType: posts.PostType;
  createdAt: Date;
  urgency: number;
  followed: boolean;
  commitments: number;
  prayingNowTaps: number;
  reach: number;
}

export const weights = {
  recencyHalfLifeHours: 24,
  followed: 1,
  /** Commitments are worth more than ephemeral taps. */
  commitment: 3,
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

/**
 * Order candidates. Ranking never removes a post: every visible request keeps
 * baseline visibility no matter how many tokens anyone spent.
 */
export function rankFeed(candidates: Candidate[], now = new Date()): Candidate[] {
  return [...candidates].sort((a, b) => score(b, now) - score(a, now) || (a.id < b.id ? 1 : -1));
}

/** The first post on open: the most recent prayer request or thanksgiving. */
export function pickPinned(candidates: Candidate[]): Candidate | null {
  return (
    candidates
      .filter((c) => c.postType === 'prayer_request' || c.postType === 'praise')
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
    created_at: Date;
    urgency: number;
    followed: boolean;
    commitments: number;
    taps: number;
    reach: string | null;
  }>(
    `select p.id, p.post_type, p.created_at, p.urgency,
            exists (select 1 from public.follows f where f.user_id = $1 and f.followee_id = p.user_id) as followed,
            (select count(*)::int from public.commitments c where c.post_id = p.id and c.status <> 'cancelled') as commitments,
            (select count(*)::int from public.prayer_events e where e.post_id = p.id and e.kind = 'praying_now') as taps,
            (select balance from public.token_accounts a where a.kind = 'post_reach' and a.post_id = p.id) as reach
       from public.posts p
      where p.moderation_status = 'visible'
        and p.created_at > now() - make_interval(days => $2)
        and (not $3 or not p.is_sensitive)
        and p.community_id = any($5::uuid[])
      order by p.created_at desc
      limit $4`,
    [viewerId, CANDIDATE_WINDOW_DAYS, viewer?.trauma_content_opt_out ?? false, CANDIDATE_LIMIT, communities],
  );
  return rows.map((r) => ({
    id: r.id,
    postType: r.post_type,
    createdAt: r.created_at,
    urgency: r.urgency,
    followed: r.followed,
    commitments: r.commitments,
    prayingNowTaps: r.taps,
    reach: Number(r.reach ?? 0),
  }));
}

export interface FeedTheme {
  slug: string;
  name: string;
  layout: 'column' | 'vine' | 'carousel' | 'flip';
  cardTemplates: Record<string, unknown>;
  animations: Record<string, unknown>;
  tokens: Record<string, unknown>;
}

/** The viewer's chosen theme in their primary community, else that community's default. */
export async function theme(q: Queryable, viewerId: string): Promise<FeedTheme | null> {
  const { rows } = await q.query<FeedTheme>(
    `select t.slug, t.name, t.layout, t.card_templates as "cardTemplates", t.animations, t.tokens
       from public.community_memberships m
       join public.feed_themes t on t.id = coalesce(
         m.feed_theme_id,
         (select theme_id from public.community_feed_themes d where d.community_id = m.community_id and d.is_default))
      where m.user_id = $1 and t.status <> 'retired'
      order by m.is_primary desc
      limit 1`,
    [viewerId],
  );
  return rows[0] ?? null;
}

/** Feed styles offered in the member's primary community, and which one they use. */
export async function themeChoices(q: Queryable, viewerId: string) {
  const { rows } = await q.query<{ slug: string; name: string; layout: string; status: string; is_default: boolean; chosen: boolean }>(
    `select t.slug, t.name, t.layout, t.status, d.is_default, (m.feed_theme_id = t.id) as chosen
       from public.community_memberships m
       join public.community_feed_themes d on d.community_id = m.community_id
       join public.feed_themes t on t.id = d.theme_id
      where m.user_id = $1 and m.is_primary and t.status <> 'retired'
      order by d.is_default desc, t.name`,
    [viewerId],
  );
  const current = rows.find((r) => r.chosen) ?? rows.find((r) => r.is_default);
  return { themes: rows.map(({ chosen: _c, ...t }) => t), current: current?.slug ?? null };
}

/** Choose a feed style offered in the primary community; null returns to the community default. */
export async function chooseTheme(q: Queryable, viewerId: string, slug: string | null) {
  const { rowCount } = await q.query(
    `update public.community_memberships m
        set feed_theme_id = case when $2::text is null then null else (
          select t.id from public.community_feed_themes d join public.feed_themes t on t.id = d.theme_id
           where d.community_id = m.community_id and t.slug = $2 and t.status <> 'retired') end
      where m.user_id = $1 and m.is_primary
        and ($2::text is null or exists (
          select 1 from public.community_feed_themes d join public.feed_themes t on t.id = d.theme_id
           where d.community_id = m.community_id and t.slug = $2 and t.status <> 'retired'))`,
    [viewerId, slug],
  );
  if (!rowCount) throw notFound('Feed style');
  return themeChoices(q, viewerId);
}

export async function getFeed(q: Queryable, viewerId: string, page = 0, pageSize = 20) {
  const all = await candidates(q, viewerId);
  const pinned = pickPinned(all);
  const ranked = rankFeed(all.filter((c) => c.id !== pinned?.id));
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
