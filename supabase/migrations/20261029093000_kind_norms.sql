-- Kind norms (docs/KIND_NORMS.md; research/Kind_Interaction_UX_Research.md sections 2, 7
-- and 8), each off until Admin → Kind norms turns it on:
--   1. The kindness promise: a short, warm promise a member can agree to once.
--   2. A small rules reminder above a member's first few replies.
--   3. Resting: when a thread heats up, replies are spaced out for a while. Nobody is
--      locked out, and nothing is hidden.
--   4. "This helped" on comments, and comments ordered by how widely different
--      members appreciate them, not by how many.
--   5. Offer a sorry (section 9): the author of a comment that got a gentle note may
--      write a private sorry, through Mend's moderator review. Needs Mend on too.
create table public.kind_norms_settings (
  id boolean primary key default true check (id),
  promise_enabled boolean not null default false,
  -- Null = the app's own wording.
  promise_text text check (promise_text is null or char_length(promise_text) between 1 and 400),
  reply_reminder_enabled boolean not null default false,
  -- The reminder shows above a member's first this-many replies.
  reply_reminder_count int not null default 3 check (reply_reminder_count between 1 and 20),
  resting_enabled boolean not null default false,
  -- This many heated replies on one post within resting_window_minutes starts a rest.
  resting_heated int not null default 3 check (resting_heated between 2 and 20),
  resting_window_minutes int not null default 30 check (resting_window_minutes between 5 and 1440),
  resting_minutes int not null default 60 check (resting_minutes between 5 and 1440),
  -- While a thread rests, each member may reply once every this-many minutes.
  resting_gap_minutes int not null default 10 check (resting_gap_minutes between 1 and 120),
  appreciation_enabled boolean not null default false,
  offer_sorry_enabled boolean not null default false
);
insert into public.kind_norms_settings default values;
alter table public.kind_norms_settings enable row level security;

create table public.kindness_promises (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  agreed_at timestamptz not null default now()
);
alter table public.kindness_promises enable row level security;

-- When a heated reply was posted on a post. Never the words or who wrote it.
create table public.thread_heat (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index thread_heat_post_idx on public.thread_heat (post_id, created_at desc);
alter table public.thread_heat enable row level security;

create table public.resting_threads (
  post_id uuid primary key references public.posts (id) on delete cascade,
  started_at timestamptz not null default now(),
  until timestamptz not null
);
alter table public.resting_threads enable row level security;

create table public.comment_appreciations (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index comment_appreciations_user_idx on public.comment_appreciations (user_id);
alter table public.comment_appreciations enable row level security;
