// Counting patterns (docs/CONVERSATION_HELPERS.md): anonymous weekly totals of how talk
// unfolds, to fill the gaps the greeting research found (no published counts of
// greeting → reply → follow-up chains, or of emoji used as a reply). Off until an admin
// switches it on, and then only from members who choose to share on Me. The phone sends
// move labels only; the totals hold no words, no member and no conversation.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest } from '../../errors.js';
import { settings } from './index.js';

const OPENING = ['greeting', 'howAreYou', 'thanks', 'trouble', 'goodNews', 'farewell'] as const;
const MOVE = [...OPENING, 'other'] as const;
/** Fewer than this in a row and the admin view folds it into "other patterns". */
export const MIN_SHOWN = 5;
const DAILY_CAP = 200;

export const Count = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('chain'), moves: z.tuple([z.enum(OPENING), z.enum(MOVE), z.enum(MOVE)]) }),
  z.object({ kind: z.literal('emoji'), emoji: z.string().min(1).max(30), meaning: z.string().min(1).max(40), toMove: z.enum(MOVE) }),
]);

async function sharing(q: Queryable, userId: string) {
  if (!(await settings(q)).talk_counts_enabled) return false;
  const { rows } = await q.query<{ share_counts: boolean }>('select share_counts from public.conversation_prefs where user_id = $1', [userId]);
  return rows[0]?.share_counts ?? false;
}

/** Adds one to this week's total. Quietly ignored unless the switch is on and the member shares. */
export async function record(q: Queryable, userId: string, input: z.infer<typeof Count>) {
  if (!(await sharing(q, userId))) return { counted: false };
  await q.query('delete from public.talk_count_quota where day < current_date - 1');
  const { rows } = await q.query<{ n: number }>(
    `insert into public.talk_count_quota (user_id) values ($1)
     on conflict (user_id, day) do update set n = talk_count_quota.n + 1 returning n`,
    [userId],
  );
  if (rows[0]!.n > DAILY_CAP) return { counted: false };
  const week = `date_trunc('week', now())::date`;
  if (input.kind === 'chain') {
    await q.query(
      `insert into public.talk_chain_counts (week, first_move, reply_move, followup_move, n) values (${week}, $1, $2, $3, 1)
       on conflict (week, first_move, reply_move, followup_move) do update set n = talk_chain_counts.n + 1`,
      input.moves,
    );
  } else {
    const known = await q.query('select 1 from public.reaction_meanings where emoji_key = $1 and meaning_key = $2', [input.emoji, input.meaning]);
    if (!known.rowCount) throw badRequest('Unknown meaning');
    await q.query(
      `insert into public.emoji_reply_counts (week, emoji_key, meaning_key, to_move, n) values (${week}, $1, $2, $3, 1)
       on conflict (week, emoji_key, meaning_key, to_move) do update set n = emoji_reply_counts.n + 1`,
      [input.emoji, input.meaning, input.toMove],
    );
  }
  return { counted: true };
}

/** The admin view: totals over the last `weeks` weeks, small rows folded together. */
export async function summary(q: Queryable, weeks = 12) {
  const since = `date_trunc('week', now())::date - ($1::int - 1) * 7`;
  const chains = await q.query<{ first_move: string; reply_move: string; followup_move: string; n: number }>(
    `select first_move, reply_move, followup_move, sum(n)::int as n from public.talk_chain_counts
      where week >= ${since} group by 1, 2, 3 order by n desc, 1, 2, 3`,
    [weeks],
  );
  const emoji = await q.query<{ emoji_key: string; meaning_key: string; to_move: string; n: number }>(
    `select emoji_key, meaning_key, to_move, sum(n)::int as n from public.emoji_reply_counts
      where week >= ${since} group by 1, 2, 3 order by n desc, 1, 2, 3`,
    [weeks],
  );
  const fold = <T extends { n: number }>(rows: T[]) => ({
    rows: rows.filter((r) => r.n >= MIN_SHOWN),
    folded: rows.filter((r) => r.n < MIN_SHOWN).reduce((s, r) => s + r.n, 0),
  });
  const c = fold(chains.rows);
  const e = fold(emoji.rows);
  return {
    weeks,
    minShown: MIN_SHOWN,
    chains: c.rows.map((r) => ({ moves: [r.first_move, r.reply_move, r.followup_move], n: r.n })),
    otherChains: c.folded,
    emoji: e.rows.map((r) => ({ emoji: r.emoji_key, meaning: r.meaning_key, toMove: r.to_move, n: r.n })),
    otherEmoji: e.folded,
  };
}
