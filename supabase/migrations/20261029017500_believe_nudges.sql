-- "What would Ted Lasso do?" nudges (docs/GROWTH_PRACTICES.md), each off until
-- Admin → Growth practices turns it on:
--   1. Lift-up reflection: a private weekly "Who did you lift up this week?".
--   2. Weeks of gratitude: a count of weeks with a gratitude card that only grows.
--      It never resets and a missed week is never mentioned (no streak to lose).
--   3. Believe moment: a "Believe" card when a prayer is answered, for the person
--      who asked and for the people who prayed.
alter table public.practice_settings
  add column lift_up_enabled boolean not null default false,
  add column gratitude_count_enabled boolean not null default false,
  add column believe_enabled boolean not null default false;

create table public.lift_up_entries (
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  body text not null check (length(body) between 1 and 280),
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start)
);
alter table public.lift_up_entries enable row level security;
