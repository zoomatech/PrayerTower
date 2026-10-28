// Highlights (roadmap "right column"): this week's most-prayed requests and
// top prayer warriors. Anonymity rules apply: a member who prays anonymously
// by default is listed as "Anonymous prayer warrior". Sensitive, hidden and
// crisis requests are never highlighted. The window and sizes are placeholders.
import type { Queryable } from '../../db.js';
import * as posts from '../posts/index.js';
import { featureOn, isSecular } from '../communities/index.js';

export const DAYS = 7;
export const TOP_PRAYERS = 3;
export const TOP_WARRIORS = 10;

export async function highlights(q: Queryable, viewerId: string) {
  if (!(await featureOn(q, viewerId, 'highlights'))) return { days: DAYS, topPrayers: [], topWarriors: [] };
  const { rows: top } = await q.query<{ id: string; prayers: number }>(
    `select p.id, count(distinct e.user_id)::int as prayers
       from public.prayer_events e join public.posts p on p.id = e.post_id
      where e.created_at > now() - make_interval(days => $1)
        and p.post_type = 'prayer_request' and p.moderation_status = 'visible' and not p.is_sensitive
        and p.community_id = public.member_community_id($3)
        and not exists (select 1 from public.moderation_items m where m.target_type = 'post' and m.target_id = p.id and m.source = 'crisis')
      group by p.id order by prayers desc, max(e.created_at) desc limit $2`,
    [DAYS, TOP_PRAYERS, viewerId],
  );
  const cards = await posts.cards(q, top.map((t) => t.id), viewerId);
  const { rows: warriors } = await q.query<{ id: string; display_name: string; anonymous: boolean; prayers: number }>(
    `select pr.id, pr.display_name, pr.anonymous_by_default as anonymous, count(*)::int as prayers
       from public.prayer_events e join public.posts p on p.id = e.post_id join public.profiles pr on pr.id = e.user_id
      where e.created_at > now() - make_interval(days => $1) and p.user_id <> e.user_id
        and p.community_id = public.member_community_id($3)
      group by pr.id order by prayers desc, pr.id limit $2`,
    [DAYS, TOP_WARRIORS, viewerId],
  );
  const secular = await isSecular(q, viewerId);
  return {
    days: DAYS,
    topPrayers: top.map((t) => ({ prayers: t.prayers, card: cards.find((c) => c.id === t.id)! })).filter((t) => t.card),
    topWarriors: warriors.map((w) => ({
      id: w.anonymous ? null : w.id,
      displayName: w.anonymous ? (secular ? 'Anonymous helper' : 'Anonymous prayer warrior') : w.display_name,
      prayers: w.prayers,
    })),
  };
}
