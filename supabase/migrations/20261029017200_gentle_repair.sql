-- Gentle repair (research/Conflict_Repair_and_Newcomer_Kindness.md in the project
-- files; docs/GENTLE_REPAIR.md). Each is off until Admin → Growth practices turns it on.
--   1. Welcome card: before a member's first comment, a short, warm card on how we
--      talk here (Matias 2019: posting the norms raised newcomer participation).
--   2. Ask kindly: someone hurt by a comment can send its author a polite, private,
--      unsigned note asking them to edit or remove it (Facebook's compassion research).
--   3. Mend: only the hurt person can invite a sorry. The author may write one with a
--      guided composer; a moderator reads it before it's delivered; the hurt person
--      can accept it or quietly close it. Nothing depends on it: no unblocking, no
--      penalty relief. Never offered across a block or for a comment held for harm.
alter table public.practice_settings
  add column welcome_card_enabled boolean not null default false,
  -- The admin's own words for the card; null uses the app's default wording.
  add column welcome_text text check (char_length(welcome_text) between 1 and 600),
  add column ask_kindly_enabled boolean not null default false,
  add column mend_enabled boolean not null default false;

create table public.welcome_dismissed (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  dismissed_at timestamptz not null default now()
);
alter table public.welcome_dismissed enable row level security;

create table public.kind_asks (
  id uuid primary key default public.uuid_v7(),
  comment_id uuid not null references public.comments (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('dismissive', 'grief', 'unkind', 'other')),
  created_at timestamptz not null default now(),
  unique (comment_id, sender_id)
);
create index kind_asks_sender_idx on public.kind_asks (sender_id);
alter table public.kind_asks enable row level security;

create table public.mends (
  id uuid primary key default public.uuid_v7(),
  comment_id uuid not null references public.comments (id) on delete cascade,
  hurt_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'review', 'returned', 'delivered', 'accepted', 'closed', 'withdrawn')),
  -- The guided sorry: what I did, that it's on me, what I'll do differently.
  what_i_did text check (char_length(what_i_did) between 1 and 600),
  on_me text check (char_length(on_me) between 1 and 600),
  next_time text check (char_length(next_time) between 1 and 600),
  -- One revision after a moderator returns it; a second return closes it.
  revisions smallint not null default 0 check (revisions between 0 and 1),
  moderator_note text check (char_length(moderator_note) <= 600),
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One invitation per comment per hurt person, ever.
  unique (comment_id, hurt_id),
  check (hurt_id <> author_id)
);
create index mends_hurt_idx on public.mends (hurt_id);
create index mends_author_idx on public.mends (author_id);
create index mends_reviewed_by_idx on public.mends (reviewed_by);
create index mends_review_idx on public.mends (created_at) where status = 'review';
alter table public.mends enable row level security;
