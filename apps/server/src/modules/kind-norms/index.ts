// Kind norms (docs/KIND_NORMS.md; research/Kind_Interaction_UX_Research.md sections
// 2, 7 and 8), each off until Admin → Kind norms turns it on:
//   1. The kindness promise: a short, warm promise ("I'll speak gently, pray sincerely,
//      and protect others' stories") a member may agree to once. Nothing depends on it.
//   2. A rules reminder above a member's first few replies.
//   3. Resting: when a thread heats up (several replies the kind cloud would flag, in a
//      short time), replies on it are spaced out for a while: each member may reply
//      once every few minutes. Nobody is locked out and nothing is hidden. Only when a
//      heated reply happened is kept, never its words or its author.
//   4. "This helped" on comments. Top-level comments are ordered by how widely they are
//      appreciated (across communities, towns, and new and long-time members), not by
//      how many people tapped, like Community Notes' "people who usually differ agree".
//   5. Offer a sorry: the author of a comment that got a gentle note ("Ask kindly") may
//      write a private sorry to whoever sent it, through Mend's moderator review
//      (modules/repair). The author never learns who it goes to.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { AppError, badRequest, forbidden, notFound } from '../../errors.js';
import { assess } from '../kindness/index.js';
import { settings as practiceSettings } from '../practices/index.js';
import { getActionable } from '../posts/index.js';

export interface KindNormsSettings {
  promise_enabled: boolean;
  promise_text: string | null;
  reply_reminder_enabled: boolean;
  reply_reminder_count: number;
  resting_enabled: boolean;
  resting_heated: number;
  resting_window_minutes: number;
  resting_minutes: number;
  resting_gap_minutes: number;
  appreciation_enabled: boolean;
  offer_sorry_enabled: boolean;
}

export async function settings(q: Queryable): Promise<KindNormsSettings> {
  const { rows } = await q.query<KindNormsSettings>(
    `select promise_enabled, promise_text, reply_reminder_enabled, reply_reminder_count, resting_enabled, resting_heated,
            resting_window_minutes, resting_minutes, resting_gap_minutes, appreciation_enabled, offer_sorry_enabled
       from public.kind_norms_settings`,
  );
  return rows[0]!;
}

export const SettingsPatch = z.object({
  promise: z.boolean().optional(),
  /** An empty string goes back to the app's own wording. */
  promiseText: z.string().trim().max(400).optional(),
  replyReminder: z.boolean().optional(),
  replyReminderCount: z.number().int().min(1).max(20).optional(),
  resting: z.boolean().optional(),
  restingHeated: z.number().int().min(2).max(20).optional(),
  restingWindowMinutes: z.number().int().min(5).max(1440).optional(),
  restingMinutes: z.number().int().min(5).max(1440).optional(),
  restingGapMinutes: z.number().int().min(1).max(120).optional(),
  appreciation: z.boolean().optional(),
  offerSorry: z.boolean().optional(),
});

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  await q.query(
    `update public.kind_norms_settings set
        promise_enabled = coalesce($1, promise_enabled),
        promise_text = case when $2::text is null then promise_text else nullif($2, '') end,
        reply_reminder_enabled = coalesce($3, reply_reminder_enabled), reply_reminder_count = coalesce($4, reply_reminder_count),
        resting_enabled = coalesce($5, resting_enabled), resting_heated = coalesce($6, resting_heated),
        resting_window_minutes = coalesce($7, resting_window_minutes), resting_minutes = coalesce($8, resting_minutes),
        resting_gap_minutes = coalesce($9, resting_gap_minutes), appreciation_enabled = coalesce($10, appreciation_enabled),
        offer_sorry_enabled = coalesce($11, offer_sorry_enabled)`,
    [
      p.promise ?? null,
      p.promiseText ?? null,
      p.replyReminder ?? null,
      p.replyReminderCount ?? null,
      p.resting ?? null,
      p.restingHeated ?? null,
      p.restingWindowMinutes ?? null,
      p.restingMinutes ?? null,
      p.restingGapMinutes ?? null,
      p.appreciation ?? null,
      p.offerSorry ?? null,
    ],
  );
  return settings(q);
}

// 1. The kindness promise -------------------------------------------------------------

/** The promise card: whether to show it, the admin's wording (null = the app's), and whether this member agreed. */
export async function promise(q: Queryable, userId: string) {
  const s = await settings(q);
  if (!s.promise_enabled) return { enabled: false, text: null, agreed: false };
  const { rowCount } = await q.query('select 1 from public.kindness_promises where user_id = $1', [userId]);
  return { enabled: true, text: s.promise_text, agreed: !!rowCount };
}

export async function agree(q: Queryable, userId: string) {
  if (!(await settings(q)).promise_enabled) throw badRequest('The kindness promise is switched off');
  await q.query('insert into public.kindness_promises (user_id) values ($1) on conflict do nothing', [userId]);
}

// 2 and 3. What the reply box shows on a post -------------------------------------------

/** The member's first few replies show the rules reminder; a resting thread says so. */
export async function replyBox(q: Queryable, userId: string, postId: string) {
  const s = await settings(q);
  let reminder = false;
  if (s.reply_reminder_enabled) {
    const { rows } = await q.query<{ n: number }>('select count(*)::int as n from public.comments where user_id = $1', [userId]);
    reminder = rows[0]!.n < s.reply_reminder_count;
  }
  const rest = s.resting_enabled ? await restingUntil(q, postId) : null;
  return { reminder, resting: rest ? { until: rest, gapMinutes: s.resting_gap_minutes } : null };
}

async function restingUntil(q: Queryable, postId: string): Promise<Date | null> {
  const { rows } = await q.query<{ until: Date }>('select until from public.resting_threads where post_id = $1 and until > now()', [postId]);
  return rows[0]?.until ?? null;
}

/** Before a reply: while the thread rests, each member replies once every few minutes. */
export async function checkResting(q: Queryable, userId: string, postId: string) {
  const s = await settings(q);
  if (!s.resting_enabled || !(await restingUntil(q, postId))) return;
  const { rows } = await q.query<{ wait: number }>(
    `select ceil(extract(epoch from (max(created_at) + make_interval(mins => $3) - now())) / 60)::int as wait
       from public.comments where post_id = $1 and user_id = $2`,
    [postId, userId, s.resting_gap_minutes],
  );
  const wait = rows[0]?.wait ?? 0;
  if (wait > 0) {
    throw new AppError(
      429,
      'resting',
      `This conversation is resting for a moment. You can reply again in ${wait} minute${wait === 1 ? '' : 's'}.`,
    );
  }
}

/** After a reply: a heated one is counted, and enough of them in a short time start a rest. Returns whether the thread now rests. */
export async function noteReply(q: Queryable, postId: string, body: string): Promise<boolean> {
  const s = await settings(q);
  if (!s.resting_enabled) return false;
  if (assess(body).level !== 'ok') {
    await q.query('insert into public.thread_heat (post_id) values ($1)', [postId]);
    const { rows } = await q.query<{ n: number }>(
      `select count(*)::int as n from public.thread_heat
        where post_id = $1 and created_at > now() - make_interval(mins => $2)
          and created_at > coalesce((select until from public.resting_threads where post_id = $1), '-infinity')`,
      [postId, s.resting_window_minutes],
    );
    if (rows[0]!.n >= s.resting_heated) {
      await q.query(
        `insert into public.resting_threads (post_id, until) values ($1, now() + make_interval(mins => $2))
         on conflict (post_id) do update set started_at = now(), until = excluded.until`,
        [postId, s.resting_minutes],
      );
    }
  }
  return !!(await restingUntil(q, postId));
}

// 4. "This helped" -------------------------------------------------------------------

export async function appreciate(q: Queryable, userId: string, commentId: string, on: boolean) {
  if (!(await settings(q)).appreciation_enabled) throw badRequest('"This helped" is switched off');
  const { rows } = await q.query<{ post_id: string; user_id: string }>(
    `select post_id, user_id from public.comments where id = $1 and moderation_status = 'visible'`,
    [commentId],
  );
  const c = rows[0];
  if (!c || !(await getActionable(q, userId, c.post_id))) throw notFound('Comment');
  if (c.user_id === userId) throw forbidden('This is your own comment');
  if (on) await q.query('insert into public.comment_appreciations (comment_id, user_id) values ($1, $2) on conflict do nothing', [commentId, userId]);
  else await q.query('delete from public.comment_appreciations where comment_id = $1 and user_id = $2', [commentId, userId]);
  return { helped: on };
}

/** How widely a comment is appreciated: extra communities, towns and new/long-time groups among those who tapped. */
export const WIDE = 2;

interface Spread {
  comment_id: string;
  spread: number;
  n: number;
  mine: boolean;
}

/**
 * Comments in thread order (as posts.listComments gives them), with each top-level
 * thread moved up by how widely its first comment is appreciated. Replies stay under
 * their parent, in time order. Unchanged while "This helped" is off.
 */
export async function arrange<C extends { id: string; depth: number }>(q: Queryable, postId: string, viewerId: string, comments: C[]) {
  if (!(await settings(q)).appreciation_enabled) return comments;
  const { newcomer_days } = await practiceSettings(q);
  const { rows } = await q.query<Spread>(
    `select a.comment_id,
            (count(distinct public.member_community_id(a.user_id)) - 1)
              + greatest(count(distinct lower(p.town)) - 1, 0)
              + (count(distinct (p.created_at > now() - make_interval(days => $3))) - 1) as spread,
            count(*)::int as n,
            bool_or(a.user_id = $2) as mine
       from public.comment_appreciations a
       join public.comments c on c.id = a.comment_id
       join public.profiles p on p.id = a.user_id
      where c.post_id = $1
      group by a.comment_id`,
    [postId, viewerId, newcomer_days],
  );
  const by = new Map(rows.map((r) => [r.comment_id, { spread: Number(r.spread), n: r.n, mine: r.mine }]));
  const blocks: C[][] = [];
  for (const c of comments) {
    if (c.depth === 0 || blocks.length === 0) blocks.push([c]);
    else blocks.at(-1)!.push(c);
  }
  const score = (b: C[]) => by.get(b[0]!.id) ?? { spread: -1, n: 0, mine: false };
  // Spread first; how many tapped only breaks ties; then the original order.
  const sorted = blocks.map((b, i) => ({ b, i })).sort((x, y) => score(y.b).spread - score(x.b).spread || score(y.b).n - score(x.b).n || x.i - y.i);
  return sorted.flatMap(({ b }) =>
    b.map((c) => {
      const s = by.get(c.id);
      return { ...c, helped: s?.mine ?? false, widelyAppreciated: (s?.spread ?? 0) >= WIDE };
    }),
  );
}

/** For /features: which of these the app shows. */
export async function features(q: Queryable) {
  const s = await settings(q);
  return { kindnessPromise: s.promise_enabled, replyReminder: s.reply_reminder_enabled, restingThreads: s.resting_enabled, thisHelped: s.appreciation_enabled, offerSorry: s.offer_sorry_enabled };
}

// 5. Offer a sorry ----------------------------------------------------------------------

/** Whether the author may offer a sorry for this comment: someone sent a gentle note about it, and no sorry is under way for them yet. */
export async function sorryOffer(q: Queryable, userId: string, commentId: string) {
  const [s, p] = [await settings(q), await practiceSettings(q)];
  if (!s.offer_sorry_enabled || !p.mend_enabled) return { available: false, mendId: null };
  const { rows } = await q.query<{ mend_id: string | null; writable: boolean }>(
    `select (select m.id from public.mends m where m.comment_id = c.id and m.hurt_id = k.sender_id) as mend_id,
            exists (select 1 from public.mends m where m.comment_id = c.id and m.hurt_id = k.sender_id and m.status in ('invited', 'returned')) as writable
       from public.comments c join public.kind_asks k on k.comment_id = c.id
      where c.id = $1 and c.user_id = $2 and c.moderation_status = 'visible'
        and not exists (select 1 from public.user_blocks b where (b.user_id = c.user_id and b.blocked_id = k.sender_id) or (b.user_id = k.sender_id and b.blocked_id = c.user_id))
      order by k.created_at`,
    [commentId, userId],
  );
  // A sorry the author started but hasn't sent yet is reopened.
  const started = rows.find((r) => r.writable);
  return { available: rows.some((r) => !r.mend_id), mendId: started?.mend_id ?? null };
}

/** The author starts a sorry to the next person who sent a gentle note. They write it on the Mend screen; a moderator reads it first. */
export async function offerSorry(q: Queryable, userId: string, commentId: string) {
  const [s, p] = [await settings(q), await practiceSettings(q)];
  if (!s.offer_sorry_enabled || !p.mend_enabled) throw badRequest('Offering a sorry is switched off');
  const { rows } = await q.query<{ id: string }>(
    `insert into public.mends (comment_id, hurt_id, author_id)
     select c.id, k.sender_id, c.user_id
       from public.comments c join public.kind_asks k on k.comment_id = c.id
      where c.id = $1 and c.user_id = $2 and c.moderation_status = 'visible'
        and not exists (select 1 from public.mends m where m.comment_id = c.id and m.hurt_id = k.sender_id)
        and not exists (select 1 from public.user_blocks b where (b.user_id = c.user_id and b.blocked_id = k.sender_id) or (b.user_id = k.sender_id and b.blocked_id = c.user_id))
      order by k.created_at limit 1
     returning id`,
    [commentId, userId],
  );
  if (!rows[0]) throw notFound('Gentle note');
  return { mendId: rows[0].id };
}
