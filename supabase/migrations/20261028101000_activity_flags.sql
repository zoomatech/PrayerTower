-- Bot / AI-agent signals on prayers (notebook Page 14: "handling AI agents?").
-- A job looks for prayer taps no person would make: too many in an hour, or
-- spaced like a metronome. It only flags for a moderator; it never penalizes.

create table public.activity_settings (
  id boolean primary key default true check (id),
  signals_enabled boolean not null default true,
  max_prayers_per_hour int not null default 60 check (max_prayers_per_hour between 5 and 10000),
  -- Metronome check: at least this many taps in the hour whose gaps barely vary.
  regular_min_events int not null default 20 check (regular_min_events between 5 and 10000),
  regular_max_stddev_seconds numeric not null default 1.0 check (regular_max_stddev_seconds between 0 and 600)
);
insert into public.activity_settings default values;

create type public.activity_flag_status as enum ('pending', 'cleared', 'confirmed');

create table public.activity_flags (
  id uuid primary key default public.uuid_v7(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('too_many', 'too_regular')),
  details jsonb not null default '{}',
  status public.activity_flag_status not null default 'pending',
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
-- One open flag per member per reason.
create unique index activity_flags_one_pending on public.activity_flags (user_id, reason) where status = 'pending';

alter table public.activity_settings enable row level security;
alter table public.activity_flags enable row level security;
