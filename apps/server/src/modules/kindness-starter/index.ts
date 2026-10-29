// Kindness starter set (docs/KINDNESS_SWITCHES.md): one admin tap turns on a short list of the
// kindness tools that need no money, no AI key and no volunteers, so the pilot can try them
// together; another tap turns the same list off. Every switch still has its own toggle and
// stays off by default. The admin routes are in the staff audit log.
import { z } from 'zod';
import type { Queryable } from '../../db.js';

/** Settings table and column for each switch in the set. Changing this list is how the set changes. */
export const STARTER = [
  ['notebook_settings', 'kind_cloud_enabled'],
  ['practice_settings', 'kindness_intro_enabled'],
  ['practice_settings', 'welcome_card_enabled'],
  ['practice_settings', 'gentle_rhythm_enabled'],
  ['practice_settings', 'gratitude_enabled'],
  ['practice_settings', 'followup_enabled'],
  ['practice_settings', 'check_back_enabled'],
  ['practice_settings', 'answered_stories_enabled'],
  ['practice_settings', 'thank_note_enabled'],
  ['practice_settings', 'ask_kindly_enabled'],
  ['practice_settings', 'mend_enabled'],
  ['practice_settings', 'path_back_enabled'],
  ['practice_settings', 'cool_down_enabled'],
  ['practice_settings', 'calm_threads_enabled'],
  ['practice_settings', 'kind_milestones_enabled'],
  ['practice_settings', 'empathy_practice_enabled'],
  ['practice_settings', 'weekly_intention_enabled'],
  ['practice_settings', 'kindness_weather_enabled'],
  ['practice_settings', 'community_health_enabled'],
  ['conversation_settings', 'author_hearts_enabled'],
  ['conversation_settings', 'comment_thanks_enabled'],
  ['conversation_settings', 'quiet_counts_enabled'],
  ['conversation_settings', 'reply_choice_enabled'],
  ['moderation_tool_settings', 'goldfish_enabled'],
] as const;

export const Apply = z.object({ on: z.boolean() });

export async function status(q: Queryable) {
  const items: { key: string; on: boolean }[] = [];
  for (const [table, column] of STARTER) {
    const { rows } = await q.query<{ on: boolean }>(`select ${column} as on from public.${table} limit 1`);
    items.push({ key: column.replace(/_enabled$/, ''), on: rows[0]?.on ?? false });
  }
  return { items, allOn: items.every((i) => i.on), anyOn: items.some((i) => i.on) };
}

export async function apply(q: Queryable, on: boolean) {
  for (const [table, column] of STARTER) await q.query(`update public.${table} set ${column} = $1`, [on]);
  return status(q);
}
