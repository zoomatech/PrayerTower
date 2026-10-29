-- Personal-growth practices ("What would Ted Lasso do?", Steve 2026-10-29), each
-- off until Admin → Growth practices turns it on. Research and sources:
-- research/Personal_Growth_Research.md in the project files, docs/GROWTH_PRACTICES.md.
--   1. Follow-up: once, some days after a request, its author is asked if they'd
--      like to tell the people who prayed how it's going. "Prefer not to say" is
--      always an answer, and nothing counts answered prayers.
--   2. Gratitude card: a private weekly "three good things" on the day the member
--      picks. A skipped week is never mentioned.
--   3. Gentle rhythm: "days you prayed this month" in place of the streak, a
--      welcome back after time away, and fresh-start invitations.
create table public.practice_settings (
  id boolean primary key default true check (id),
  followup_enabled boolean not null default false,
  followup_days int not null default 21 check (followup_days between 3 and 120),
  gratitude_enabled boolean not null default false,
  gentle_rhythm_enabled boolean not null default false
);
insert into public.practice_settings default values;
alter table public.practice_settings enable row level security;

-- One follow-up per request, ever.
create table public.request_followups (
  post_id uuid primary key references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  asked_at timestamptz not null default now(),
  answer text check (answer in ('grateful', 'still', 'changed', 'private')),
  answered_at timestamptz,
  check ((answer is null) = (answered_at is null))
);
create index request_followups_user_idx on public.request_followups (user_id);
alter table public.request_followups enable row level security;

-- The member's chosen day (0 = Sunday) and time zone for the gratitude card.
create table public.gratitude_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  time_zone text not null check (length(time_zone) between 1 and 64),
  updated_at timestamptz not null default now()
);
alter table public.gratitude_prefs enable row level security;

-- Private to the member. One card per week (weeks start on Monday).
create table public.gratitude_entries (
  id uuid primary key default public.uuid_v7(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  items text[] not null check (cardinality(items) between 1 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);
alter table public.gratitude_entries enable row level security;
