// Cool-down (docs/GROWTH_PRACTICES.md): "What would Ted Lasso do?" When two members
// trade HEATED (3) flagged replies within a day, both are offered a pause card with a
// gentle line. Flagged means the kind cloud's word rules (modules/kindness) would raise
// a cloud: an insult aimed at someone, a stream of swearing, or a threat. The reply is
// always posted: this never blocks, holds or hides anything (Steve, 2026-10-29: a
// person reviews before anything is blocked). Only who replied to whom, and when, is
// kept; never the words. Off until practice_settings.cool_down_enabled.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { assess } from '../kindness/index.js';
import { settings } from '../practices/index.js';

export const HEATED = 3;
/** The app has this many pause lines (coolDown.lines in the locales). */
export const LINES = 4;

const flagged = (body: string) => assess(body).level !== 'ok';

/** Note one reply from one member to another; returns true when a cool-down is now waiting for the sender. */
export async function note(q: Queryable, fromId: string, toId: string | null | undefined, body: string): Promise<boolean> {
  if (!toId || toId === fromId || !flagged(body)) return false;
  if (!(await settings(q)).cool_down_enabled) return false;
  await q.query('insert into public.heated_replies (from_id, to_id) values ($1, $2)', [fromId, toId]);
  const [a, b] = fromId < toId ? [fromId, toId] : [toId, fromId];
  const { rows } = await q.query<{ n: number; offered: boolean }>(
    `select (select count(*)::int from public.heated_replies
              where ((from_id = $1 and to_id = $2) or (from_id = $2 and to_id = $1)) and created_at > now() - interval '1 day') as n,
            exists (select 1 from public.cool_downs where a_id = $1 and b_id = $2 and created_at > now() - interval '1 day') as offered`,
    [a, b],
  );
  const { n, offered } = rows[0]!;
  if (offered) return !!(await mine(q, fromId));
  if (n < HEATED) return false;
  await q.query('insert into public.cool_downs (a_id, b_id, line) values ($1, $2, $3)', [a, b, Math.floor(Math.random() * LINES)]);
  return true;
}

/** A reply to a comment goes to that comment's author; a top-level comment to the poster. */
export async function noteComment(q: Queryable, userId: string, postId: string, parentId: string | undefined, body: string) {
  const { rows } = await q.query<{ to_id: string }>(
    parentId ? 'select user_id as to_id from public.comments where id = $1' : 'select user_id as to_id from public.posts where id = $1',
    [parentId ?? postId],
  );
  return note(q, userId, rows[0]?.to_id, body);
}

/** Only one-to-one conversations: in a group, a heated line isn't aimed at one person. */
export async function noteMessage(q: Queryable, userId: string, conversationId: string, body: string) {
  const { rows } = await q.query<{ to_id: string }>(
    `select m.user_id as to_id from public.conversation_members m join public.conversations c on c.id = m.conversation_id
      where m.conversation_id = $1 and m.user_id <> $2 and c.kind <> 'group'`,
    [conversationId, userId],
  );
  return rows.length === 1 ? note(q, userId, rows[0]!.to_id, body) : false;
}

/** The waiting pause card, if any: from the last day, and not yet answered by this member. */
export async function mine(q: Queryable, userId: string) {
  if (!(await settings(q)).cool_down_enabled) return null;
  const { rows } = await q.query<{ id: string; line: number }>(
    `select id, line from public.cool_downs
      where created_at > now() - interval '1 day'
        and ((a_id = $1 and a_done is null) or (b_id = $1 and b_done is null))
      order by created_at desc limit 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export const Done = z.object({ choice: z.enum(['breather', 'okay']) });

export async function done(q: Queryable, userId: string, id: string, choice: z.infer<typeof Done>['choice']) {
  await q.query(
    `update public.cool_downs set a_done = case when a_id = $2 then $3 else a_done end, b_done = case when b_id = $2 then $3 else b_done end
      where id = $1 and (a_id = $2 or b_id = $2)`,
    [id, userId, choice],
  );
}
