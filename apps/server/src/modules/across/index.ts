// Praying across lines (concept document Phase 4: "most improbable connection
// surfaced optionally"). Off until notebook_settings.cross_community_enabled.
// A member who opts in gets one prayer request a day from another faith
// community whose author also opted in; never from or to Open Circle or any
// neutral-wording community (posts.acrossAllowed holds the rules).
import type { Queryable } from '../../db.js';
import { cards, getVisible, acrossAllowed } from '../posts/index.js';

/** Today's request from another community, or null. Stable for the day, different for each member. */
export async function today(q: Queryable, viewerId: string) {
  const { rows } = await q.query<{ id: string }>(
    `select p.id from public.posts p
       join public.profiles a on a.id = p.user_id and a.open_to_other_communities and a.deleted_at is null
      where p.post_type = 'prayer_request' and p.moderation_status = 'visible' and p.state <> 'answered'
        and not p.is_sensitive and not p.crisis and p.user_id <> $1
        and p.created_at > now() - interval '14 days'
        and not exists (select 1 from public.community_memberships m where m.user_id = $1 and m.community_id = p.community_id)
        and not exists (select 1 from public.user_blocks b where (b.user_id = $1 and b.blocked_id = p.user_id) or (b.user_id = p.user_id and b.blocked_id = $1))
      order by md5(p.id::text || $1 || current_date::text)
      limit 20`,
    [viewerId],
  );
  for (const r of rows) {
    const post = await getVisible(q, r.id);
    if (post && (await acrossAllowed(q, viewerId, post))) return (await cards(q, [post.id], viewerId))[0] ?? null;
  }
  return null;
}
