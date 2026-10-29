-- The moderator on-call rota (docs/HARMFUL_PRAYERS.md, "On-call rota"). Off by default.
-- A held or crisis item that waits too long reminds whoever is on call, then goes to an admin.
create table public.oncall_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  -- The longest a held or crisis item should wait for a person.
  max_wait_minutes int not null default 60 check (max_wait_minutes between 5 and 1440),
  -- Remind whoever is on call when an item has waited this share of the limit.
  remind_at_percent int not null default 50 check (remind_at_percent between 10 and 100),
  -- Shift times are in this time zone.
  timezone text not null default 'America/New_York',
  -- Who hears when the limit passes; empty means every admin.
  escalate_to uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.oncall_settings default values;
alter table public.oncall_settings enable row level security;

-- Weekly shifts: a moderator is on call on this weekday (0 = Sunday) between these minutes of the day.
create table public.oncall_shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_minute int not null check (start_minute between 0 and 1439),
  end_minute int not null check (end_minute between 1 and 1440 and end_minute > start_minute),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index oncall_shifts_weekday on public.oncall_shifts (weekday);
alter table public.oncall_shifts enable row level security;

-- Notes one shift leaves the next ("Two threats from the same account, watch for more").
create table public.oncall_notes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index oncall_notes_created on public.oncall_notes (created_at desc);
alter table public.oncall_notes enable row level security;

alter table public.moderation_items
  add column oncall_reminded_at timestamptz,
  add column oncall_escalated_at timestamptz;

-- Restoring a held post with one tap: logged as a restore, and its author is told. Off by default.
alter table public.moderator_care_settings add column restore_enabled boolean not null default false;
