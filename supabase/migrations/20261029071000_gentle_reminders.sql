-- Gentle reminders and weeks of prayer (2026-10-29). Two switches, both off:
-- - A daily reminder at a time and on days the member picks. It is skipped on a
--   day they already prayed, never says what was missed, and after a run of
--   reminders that went by unused it quietly drops to once a week until they
--   pray again.
-- - Weeks of prayer in place of the daily streak: a total that only grows, and
--   "weeks in a row" that allows one rest week between and is only shown while
--   it is 2 or more, so nothing is ever shown as lost.
create table public.reminder_settings (
  id boolean primary key default true check (id),
  daily_reminder_enabled boolean not null default false,
  gentle_streak_enabled boolean not null default false,
  -- Reminders in a row that went by with no prayer before it drops to weekly.
  quiet_after int not null default 7 check (quiet_after between 3 and 60)
);
insert into public.reminder_settings default values;
alter table public.reminder_settings enable row level security;

create table public.daily_reminders (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  hour smallint not null check (hour between 0 and 23),
  minute smallint not null check (minute between 0 and 59),
  -- 0 = Sunday … 6 = Saturday, in the member's time zone.
  days smallint[] not null default '{0,1,2,3,4,5,6}' check (days <@ '{0,1,2,3,4,5,6}'::smallint[] and cardinality(days) between 1 and 7),
  time_zone text not null,
  next_at timestamptz not null,
  last_sent_at timestamptz,
  unanswered int not null default 0,
  created_at timestamptz not null default now()
);
create index daily_reminders_due_idx on public.daily_reminders (next_at);
alter table public.daily_reminders enable row level security;
