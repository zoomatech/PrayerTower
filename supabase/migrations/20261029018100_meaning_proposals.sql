-- Member-made emoji meanings (docs/CONVERSATION_HELPERS.md). Off until Admin →
-- Conversation helpers turns it on (and Emoji meanings is on). A member suggests a new
-- meaning for one of the emoji; an admin reads it, can reword it (faith and Open Circle
-- wording), and approves or declines. An approved meaning joins the tree, in a free
-- place or in place of a meaning the admin retires.
alter table public.conversation_settings
  add column if not exists meaning_proposals_enabled boolean not null default false;

-- Retired meanings keep their row (leaves on old posts still point at them), so only
-- meanings in use need a place of their own.
alter table public.reaction_meanings drop constraint if exists reaction_meanings_emoji_key_position_key;
create unique index if not exists reaction_meanings_enabled_position on public.reaction_meanings (emoji_key, position) where enabled;

create table public.meaning_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  emoji_key text not null,
  label text not null check (char_length(label) between 2 and 40),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  meaning_key text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null
);
create index meaning_proposals_user_idx on public.meaning_proposals (user_id, created_at desc);
create index meaning_proposals_pending_idx on public.meaning_proposals (created_at) where status = 'pending';
create index meaning_proposals_decided_by_idx on public.meaning_proposals (decided_by);
alter table public.meaning_proposals enable row level security;
