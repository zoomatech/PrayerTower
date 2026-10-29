-- Conversation helpers from the greeting-sequence research (research/
-- Greeting_Sequences_and_Conversational_Chains.md; docs/CONVERSATION_HELPERS.md).
-- Six switches, all off; each member also opts in for themselves.
--   1. Reply suggestions: one suggested reply per kind of move (a greeting gets a
--      greeting back, thanks gets "you're welcome"). Never sent on their own.
--   2. My meaning words: members pick each emoji's first word and hide words they don't want.
--   3. "How are you" care: after a downbeat answer, a gentle "Want me to pray about anything?"
--   4. Greeting packs: greetings from other traditions, each with a note on who it fits.
--   5. In your own words: after a suggestion is used, a light nudge to make it yours.
--   6. Kind closings: a gentle way to end a conversation instead of letting it drop.
create table public.conversation_settings (
  id boolean primary key default true check (id),
  reply_suggestions_enabled boolean not null default false,
  meaning_prefs_enabled boolean not null default false,
  trouble_nudge_enabled boolean not null default false,
  greeting_packs_enabled boolean not null default false,
  own_words_enabled boolean not null default false,
  kind_closings_enabled boolean not null default false
);
insert into public.conversation_settings default values;
alter table public.conversation_settings enable row level security;

create table public.conversation_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  reply_suggestions boolean not null default false,
  trouble_nudge boolean not null default false,
  kind_closings boolean not null default false,
  greeting_pack text check (greeting_pack in ('chinese', 'korean', 'arabic', 'yoruba', 'hebrew', 'hawaiian')),
  updated_at timestamptz not null default now()
);
alter table public.conversation_prefs enable row level security;

create table public.meaning_prefs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji_key text not null check (length(emoji_key) between 1 and 30),
  default_meaning text check (length(default_meaning) between 1 and 40),
  hidden text[] not null default '{}',
  primary key (user_id, emoji_key)
);
alter table public.meaning_prefs enable row level security;
