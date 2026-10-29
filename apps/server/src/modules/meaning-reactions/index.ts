// Emoji reactions that say something (Steve, 2026-10-29). A tap on 🙏 ❤️ 🫂 💪 🎉 🕯️
// adds that emoji's first meaning as a "leaf" on the post; a long-press offers up to
// five positive meanings. The tree lives in reaction_meanings (faith and neutral
// wording), so staff can reword or retire a meaning. Off until an admin turns on
// meaning_reactions_enabled. Research: research/Emoji_Reaction_Tree_Research.md.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, notFound } from '../../errors.js';
import { getActionable, getViewable } from '../posts/index.js';

export const Choice = z.object({ emoji: z.string().min(1).max(30), meaning: z.string().min(1).max(40) });

export async function enabled(q: Queryable) {
  const { rows } = await q.query<{ on: boolean }>('select meaning_reactions_enabled as on from public.notebook_settings');
  return rows[0]?.on === true;
}

async function requireOn(q: Queryable) {
  if (!(await enabled(q))) throw badRequest('Emoji meanings are switched off');
}

type Row = { emoji_key: string; emoji: string; meaning_key: string; position: number; faith_label: string; neutral_label: string };

/** The tree: each emoji with its meanings in order (the first is what a plain tap adds). */
export async function tree(q: Queryable) {
  await requireOn(q);
  const { rows } = await q.query<Row>(
    `select emoji_key, emoji, meaning_key, position, faith_label, neutral_label from public.reaction_meanings
      where enabled order by array_position(array['praying','love','support','strength','celebrate','remember'], emoji_key), emoji_key, position`,
  );
  const out: { key: string; emoji: string; meanings: { key: string; label: string; neutralLabel: string }[] }[] = [];
  for (const r of rows) {
    let e = out.find((x) => x.key === r.emoji_key);
    if (!e) out.push((e = { key: r.emoji_key, emoji: r.emoji, meanings: [] }));
    e.meanings.push({ key: r.meaning_key, label: r.faith_label, neutralLabel: r.neutral_label });
  }
  return out;
}

/** The leaves on a post: one per meaning chosen, with how many chose it and whether the viewer did. */
export async function leaves(q: Queryable, postId: string, viewerId: string) {
  const { rows } = await q.query<{ emoji_key: string; emoji: string; meaning_key: string; label: string; neutral_label: string; n: number; mine: boolean }>(
    `select m.emoji_key, rm.emoji, m.meaning_key, rm.faith_label as label, rm.neutral_label, count(*)::int as n, bool_or(m.user_id = $2) as mine
       from public.meaning_reactions m join public.reaction_meanings rm using (emoji_key, meaning_key)
      where m.post_id = $1 group by m.emoji_key, rm.emoji, m.meaning_key, rm.faith_label, rm.neutral_label, rm.position
      order by n desc, m.emoji_key, rm.position`,
    [postId, viewerId],
  );
  return rows.map((r) => ({ emoji: r.emoji_key, icon: r.emoji, meaning: r.meaning_key, label: r.label, neutralLabel: r.neutral_label, count: r.n, mine: r.mine }));
}

export async function list(q: Queryable, viewerId: string, postId: string) {
  await requireOn(q);
  if (!(await getViewable(q, viewerId, postId))) throw notFound('Post');
  return leaves(q, postId, viewerId);
}

/** Adds the member's meaning for an emoji, replacing any other meaning of that emoji they chose. */
export async function choose(q: Queryable, userId: string, postId: string, input: z.infer<typeof Choice>) {
  await requireOn(q);
  if (!(await getActionable(q, userId, postId))) throw notFound('Post');
  const { rows } = await q.query('select 1 from public.reaction_meanings where emoji_key = $1 and meaning_key = $2 and enabled', [input.emoji, input.meaning]);
  if (!rows.length) throw badRequest('Unknown meaning');
  await q.query(
    `insert into public.meaning_reactions (post_id, user_id, emoji_key, meaning_key) values ($1, $2, $3, $4)
     on conflict (post_id, user_id, emoji_key) do update set meaning_key = excluded.meaning_key, created_at = now()`,
    [postId, userId, input.emoji, input.meaning],
  );
  return leaves(q, postId, userId);
}

export async function remove(q: Queryable, userId: string, postId: string, emoji: string) {
  await requireOn(q);
  await q.query('delete from public.meaning_reactions where post_id = $1 and user_id = $2 and emoji_key = $3', [postId, userId, emoji]);
  return leaves(q, postId, userId);
}
