// Kindness highlights (docs/GROWTH_PRACTICES.md): each week, a few real examples of
// members lifting each other up, shown with no names. Off until Admin → Growth
// practices turns it on. A person decides at every step: the member who was lifted up
// nominates a comment on their own request, its author says yes or no, an admin picks
// and may trim the words, and the author can withdraw at any time.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, notFound } from '../../errors.js';
import * as notifications from '../notifications/index.js';
import { settings } from '../practices/index.js';

const thisWeek = `date_trunc('week', now())::date`;

async function requireHighlights(q: Queryable) {
  if (!(await settings(q)).highlights_enabled) throw badRequest('Kindness highlights are switched off');
}

/** "This lifted me up": only the request's author, about someone else's visible comment. Asked once per comment. */
export async function nominate(q: Queryable, userId: string, commentId: string) {
  await requireHighlights(q);
  const { rows } = await q.query<{ author_id: string; poster_id: string; status: string }>(
    `select c.user_id as author_id, p.user_id as poster_id, c.moderation_status as status
       from public.comments c join public.posts p on p.id = c.post_id where c.id = $1`,
    [commentId],
  );
  const c = rows[0];
  if (!c || c.status !== 'visible') throw notFound('Comment');
  if (c.poster_id !== userId) throw badRequest('Only the person who asked can choose this');
  if (c.author_id === userId) throw badRequest('This is your own comment');
  const { rows: made } = await q.query<{ id: string }>(
    `insert into public.kindness_nominations (comment_id, nominated_by, author_id, community_id)
     values ($1, $2, $3, public.member_community_id($3)) on conflict (comment_id) do nothing returning id`,
    [commentId, userId, c.author_id],
  );
  if (made[0])
    await notifications.notify(q, c.author_id, {
      kind: 'highlight_ask',
      title: 'Your comment lifted someone up',
      body: "Someone said your comment lifted them up. May we share your words, with no names, in this week's kindness highlights? It's entirely up to you.",
      data: { screen: 'highlights' },
    });
  return { asked: true };
}

/** The author's side: what they've been asked about, and what they agreed to share. */
export async function mine(q: Queryable, userId: string) {
  if (!(await settings(q)).highlights_enabled) return { enabled: false as const, asks: [] };
  const { rows } = await q.query<{ id: string; status: string; body: string; shown_text: string | null }>(
    `select n.id, n.status, c.body, n.shown_text from public.kindness_nominations n join public.comments c on c.id = n.comment_id
      where n.author_id = $1 and n.status in ('asked', 'consented', 'picked') order by n.created_at desc`,
    [userId],
  );
  return { enabled: true as const, asks: rows.map((r) => ({ id: r.id, status: r.status, body: r.body, shownText: r.shown_text })) };
}

/** The author's yes or no. */
export async function answer(q: Queryable, userId: string, id: string, yes: boolean) {
  await requireHighlights(q);
  const { rowCount } = await q.query(
    `update public.kindness_nominations set status = $3, decided_at = now() where id = $1 and author_id = $2 and status = 'asked'`,
    [id, userId, yes ? 'consented' : 'declined'],
  );
  if (!rowCount) throw notFound('Request');
  return mine(q, userId);
}

/** The author withdraws at any time; a picked highlight disappears at once. */
export async function withdraw(q: Queryable, userId: string, id: string) {
  await requireHighlights(q);
  const { rowCount } = await q.query(
    `update public.kindness_nominations set status = 'withdrawn', shown_text = null, week = null, decided_at = now()
      where id = $1 and author_id = $2 and status in ('asked', 'consented', 'picked')`,
    [id, userId],
  );
  if (!rowCount) throw notFound('Request');
  return mine(q, userId);
}

/** Admin: everything consented, plus this week's picks. */
export async function queue(q: Queryable) {
  const { rows } = await q.query<{ id: string; status: string; body: string; shown_text: string | null; community: string | null }>(
    `select n.id, n.status, c.body, n.shown_text, co.name as community
       from public.kindness_nominations n join public.comments c on c.id = n.comment_id
       left join public.communities co on co.id = n.community_id
      where n.status = 'consented' or (n.status = 'picked' and n.week = ${thisWeek})
      order by n.status desc, n.decided_at`,
  );
  return rows.map((r) => ({ id: r.id, status: r.status, body: r.body, shownText: r.shown_text, community: r.community }));
}

export const Pick = z.object({ pick: z.boolean(), shownText: z.string().trim().min(1).max(600).optional() });

/** Admin picks a consented example for this week (trimming names out if needed), or puts it back. */
export async function pick(q: Queryable, id: string, input: z.infer<typeof Pick>) {
  const { rows } = await q.query<{ body: string }>(
    `select c.body from public.kindness_nominations n join public.comments c on c.id = n.comment_id where n.id = $1 and n.status in ('consented', 'picked')`,
    [id],
  );
  if (!rows[0]) throw notFound('Highlight');
  if (input.pick)
    await q.query(`update public.kindness_nominations set status = 'picked', week = ${thisWeek}, shown_text = $2 where id = $1`, [
      id,
      (input.shownText ?? rows[0].body).slice(0, 600),
    ]);
  else await q.query(`update public.kindness_nominations set status = 'consented', week = null, shown_text = null where id = $1`, [id]);
  return queue(q);
}

/** What members see: this week's and last week's picks in their community, words only. */
export async function highlights(q: Queryable, userId: string) {
  if (!(await settings(q)).highlights_enabled) return { enabled: false as const, weeks: [] };
  const { rows } = await q.query<{ id: string; text: string; week: string }>(
    `select n.id, n.shown_text as text, to_char(n.week, 'YYYY-MM-DD') as week from public.kindness_nominations n
      where n.status = 'picked' and n.week >= ${thisWeek} - 7
        and n.community_id is not distinct from public.member_community_id($1)
      order by n.week desc, n.decided_at`,
    [userId],
  );
  const weeks = [...new Set(rows.map((r) => r.week))].map((week) => ({ week, items: rows.filter((r) => r.week === week).map((r) => ({ id: r.id, text: r.text })) }));
  return { enabled: true as const, weeks };
}

/** Admin sends this week's highlights: one notice per member of each community that has picks, once a week. */
export async function send(q: Queryable) {
  await requireHighlights(q);
  const { rows } = await q.query<{ user_id: string; week: string }>(
    `select p.id as user_id, to_char(${thisWeek}, 'YYYY-MM-DD') as week from public.profiles p
      where exists (select 1 from public.kindness_nominations n where n.status = 'picked' and n.week = ${thisWeek}
                     and n.community_id is not distinct from public.member_community_id(p.id))`,
  );
  for (const r of rows)
    await notifications.notify(q, r.user_id, {
      kind: 'highlights',
      title: "This week's kindness highlights",
      body: 'A few of the ways people here lifted each other up this week.',
      data: { screen: 'highlights' },
      dedupeKey: `highlights:${r.week}:${r.user_id}`,
    });
  return { sent: rows.length };
}
