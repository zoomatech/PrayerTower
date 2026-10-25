// Feed module: V1 single-column feed, fan-out on read. Posts are stored once
// and ranked at read time. All ranking weights live in rankFeed() so they
// change in one place.
import type { Queryable } from '../../db.js';
import { getProfile } from '../accounts/index.js';
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
      order by p.created_at desc
      limit $4`,
    [viewerId, CANDIDATE_WINDOW_DAYS, viewer?.trauma_content_opt_out ?? false, CANDIDATE_LIMIT],
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

export async function getFeed(q: Queryable, viewerId: string, page = 0, pageSize = 20) {
  const all = await candidates(q, viewerId);
  const pinned = pickPinned(all);
  const ranked = rankFeed(all.filter((c) => c.id !== pinned?.id));
  const ordered = pinned ? [pinned, ...ranked] : ranked;
  const slice = ordered.slice(page * pageSize, (page + 1) * pageSize);
  return {
    posts: await posts.cards(q, slice.map((c) => c.id), viewerId),
    pinnedId: page === 0 ? (pinned?.id ?? null) : null,
    nextPage: (page + 1) * pageSize < ordered.length ? page + 1 : null,
  };
}
