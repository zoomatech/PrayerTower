// Conversation helpers (docs/CONVERSATION_HELPERS.md), from the greeting-sequence
// research: talk comes in pairs (a greeting gets a greeting, thanks gets "you're
// welcome"; Schegloff 1968, Switchboard DAMSL), "how are you" often carries a real
// need (Heritage 1998), and suggested replies help warmth but flatten writing and
// cost trust when they look automatic (Hohenstein 2023; Arnold 2020). Their switches,
// all off (conversation_settings), and each member opts in (conversation_prefs).
// The suggestions themselves are worked out on the device; nothing a member types
// is sent anywhere for them.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest } from '../../errors.js';

export interface ConversationSettings {
  reply_suggestions_enabled: boolean;
  meaning_prefs_enabled: boolean;
  trouble_nudge_enabled: boolean;
  greeting_packs_enabled: boolean;
  own_words_enabled: boolean;
  kind_closings_enabled: boolean;
  talk_counts_enabled: boolean;
  meaning_row_enabled: boolean;
  research_page_enabled: boolean;
  meaning_proposals_enabled: boolean;
  type_prompts_enabled: boolean;
}

export async function settings(q: Queryable): Promise<ConversationSettings> {
  const { rows } = await q.query<ConversationSettings>(
    `select reply_suggestions_enabled, meaning_prefs_enabled, trouble_nudge_enabled, greeting_packs_enabled, own_words_enabled, kind_closings_enabled,
            talk_counts_enabled, meaning_row_enabled, research_page_enabled, meaning_proposals_enabled, type_prompts_enabled
       from public.conversation_settings`,
  );
  return rows[0]!;
}

export const SettingsPatch = z.object({
  replySuggestionsEnabled: z.boolean().optional(),
  meaningPrefsEnabled: z.boolean().optional(),
  troubleNudgeEnabled: z.boolean().optional(),
  greetingPacksEnabled: z.boolean().optional(),
  ownWordsEnabled: z.boolean().optional(),
  kindClosingsEnabled: z.boolean().optional(),
  talkCountsEnabled: z.boolean().optional(),
  meaningRowEnabled: z.boolean().optional(),
  researchPageEnabled: z.boolean().optional(),
  meaningProposalsEnabled: z.boolean().optional(),
  typePromptsEnabled: z.boolean().optional(),
});

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  await q.query(
    `update public.conversation_settings set
       reply_suggestions_enabled = coalesce($1, reply_suggestions_enabled), meaning_prefs_enabled = coalesce($2, meaning_prefs_enabled),
       trouble_nudge_enabled = coalesce($3, trouble_nudge_enabled), greeting_packs_enabled = coalesce($4, greeting_packs_enabled),
       own_words_enabled = coalesce($5, own_words_enabled), kind_closings_enabled = coalesce($6, kind_closings_enabled),
       talk_counts_enabled = coalesce($7, talk_counts_enabled), meaning_row_enabled = coalesce($8, meaning_row_enabled),
       research_page_enabled = coalesce($9, research_page_enabled),
       meaning_proposals_enabled = coalesce($10, meaning_proposals_enabled), type_prompts_enabled = coalesce($11, type_prompts_enabled)`,
    [
      p.replySuggestionsEnabled ?? null,
      p.meaningPrefsEnabled ?? null,
      p.troubleNudgeEnabled ?? null,
      p.greetingPacksEnabled ?? null,
      p.ownWordsEnabled ?? null,
      p.kindClosingsEnabled ?? null,
      p.talkCountsEnabled ?? null,
      p.meaningRowEnabled ?? null,
      p.researchPageEnabled ?? null,
      p.meaningProposalsEnabled ?? null,
      p.typePromptsEnabled ?? null,
    ],
  );
  return settings(q);
}

export async function features(q: Queryable) {
  const s = await settings(q);
  return {
    replySuggestions: s.reply_suggestions_enabled,
    meaningPrefs: s.meaning_prefs_enabled,
    troubleNudge: s.trouble_nudge_enabled,
    greetingPacks: s.greeting_packs_enabled,
    ownWords: s.own_words_enabled,
    kindClosings: s.kind_closings_enabled,
    talkCounts: s.talk_counts_enabled,
    meaningIconRow: s.meaning_row_enabled,
    kindnessResearch: s.research_page_enabled,
    meaningProposals: s.meaning_proposals_enabled,
    typePrompts: s.type_prompts_enabled,
  };
}

// The member's own choices ----------------------------------------------------------

export const PACKS = ['chinese', 'korean', 'arabic', 'yoruba', 'hebrew', 'hawaiian'] as const;

export async function prefs(q: Queryable, userId: string) {
  const { rows } = await q.query<{ reply_suggestions: boolean; trouble_nudge: boolean; kind_closings: boolean; greeting_pack: string | null; share_counts: boolean }>(
    'select reply_suggestions, trouble_nudge, kind_closings, greeting_pack, share_counts from public.conversation_prefs where user_id = $1',
    [userId],
  );
  const p = rows[0];
  return { replySuggestions: p?.reply_suggestions ?? false, troubleNudge: p?.trouble_nudge ?? false, kindClosings: p?.kind_closings ?? false, greetingPack: p?.greeting_pack ?? null,
    shareCounts: p?.share_counts ?? false,
  };
}

export const PrefsPatch = z.object({
  replySuggestions: z.boolean().optional(),
  troubleNudge: z.boolean().optional(),
  kindClosings: z.boolean().optional(),
  greetingPack: z.enum(PACKS).nullable().optional(),
  shareCounts: z.boolean().optional(),
});

export async function updatePrefs(q: Queryable, userId: string, p: z.infer<typeof PrefsPatch>) {
  await q.query(
    `insert into public.conversation_prefs (user_id, reply_suggestions, trouble_nudge, kind_closings, greeting_pack, share_counts)
     values ($1, coalesce($2, false), coalesce($3, false), coalesce($4, false), $5, coalesce($7, false))
     on conflict (user_id) do update set
       reply_suggestions = coalesce($2, conversation_prefs.reply_suggestions),
       trouble_nudge = coalesce($3, conversation_prefs.trouble_nudge),
       kind_closings = coalesce($4, conversation_prefs.kind_closings),
       greeting_pack = case when $6 then $5 else conversation_prefs.greeting_pack end,
       share_counts = coalesce($7, conversation_prefs.share_counts),
       updated_at = now()`,
    [userId, p.replySuggestions ?? null, p.troubleNudge ?? null, p.kindClosings ?? null, p.greetingPack ?? null, p.greetingPack !== undefined, p.shareCounts ?? null],
  );
  return prefs(q, userId);
}

// My meaning words --------------------------------------------------------------------

type Tree = { key: string; emoji: string; meanings: { key: string; label: string; neutralLabel: string }[] }[];

export async function meaningPrefs(q: Queryable, userId: string) {
  const { rows } = await q.query<{ emoji_key: string; default_meaning: string | null; hidden: string[] }>(
    'select emoji_key, default_meaning, hidden from public.meaning_prefs where user_id = $1',
    [userId],
  );
  return rows.map((r) => ({ emoji: r.emoji_key, defaultMeaning: r.default_meaning, hidden: r.hidden }));
}

/** The member's first word moves to the front and hidden words drop out; an emoji always keeps at least one word. */
export async function personalize(q: Queryable, userId: string, tree: Tree): Promise<Tree> {
  if (!(await settings(q)).meaning_prefs_enabled) return tree;
  const mine = new Map((await meaningPrefs(q, userId)).map((p) => [p.emoji, p]));
  return tree.map((e) => {
    const p = mine.get(e.key);
    if (!p) return e;
    const shown = e.meanings.filter((m) => !p.hidden.includes(m.key) || m.key === p.defaultMeaning);
    const kept = shown.length ? shown : e.meanings.slice(0, 1);
    const first = kept.find((m) => m.key === p.defaultMeaning);
    return { ...e, meanings: first ? [first, ...kept.filter((m) => m !== first)] : kept };
  });
}

export const MeaningPref = z.object({
  emoji: z.string().min(1).max(30),
  defaultMeaning: z.string().min(1).max(40).nullable(),
  hidden: z.array(z.string().min(1).max(40)).max(5),
});

export async function setMeaningPref(q: Queryable, userId: string, input: z.infer<typeof MeaningPref>) {
  if (!(await settings(q)).meaning_prefs_enabled) throw badRequest('My meaning words is switched off');
  const { rows } = await q.query<{ meaning_key: string }>('select meaning_key from public.reaction_meanings where emoji_key = $1 and enabled', [input.emoji]);
  const keys = rows.map((r) => r.meaning_key);
  if (!keys.length) throw badRequest('Unknown emoji');
  if ([input.defaultMeaning, ...input.hidden].some((k) => k !== null && !keys.includes(k))) throw badRequest('Unknown meaning');
  if (input.hidden.length >= keys.length) throw badRequest('Keep at least one word');
  await q.query(
    `insert into public.meaning_prefs (user_id, emoji_key, default_meaning, hidden) values ($1, $2, $3, $4)
     on conflict (user_id, emoji_key) do update set default_meaning = excluded.default_meaning, hidden = excluded.hidden`,
    [userId, input.emoji, input.defaultMeaning, input.hidden],
  );
  return meaningPrefs(q, userId);
}
