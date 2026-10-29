-- Pilot tools (docs/PILOT_TOOLS.md), each off until an admin turns it on:
-- "Tell Steve", a shortcut to the feedback inbox from the feed and Me; a weekly
-- feedback summary for admins; and the error log, where app crashes and the
-- API's unexpected failures are kept (grouped, with a count) for Admin → Error log.
create table public.pilot_tools_settings (
  id boolean primary key default true check (id),
  tell_founder_enabled boolean not null default false,
  -- Who the shortcut names: "Tell Steve".
  founder_name text not null default 'Steve' check (length(founder_name) between 1 and 40),
  feedback_summary_enabled boolean not null default false,
  -- Also email the summary to admins (needs SMTP_URL).
  feedback_summary_email boolean not null default true,
  error_capture_enabled boolean not null default false
);
insert into public.pilot_tools_settings default values;
alter table public.pilot_tools_settings enable row level security;

-- One row per distinct error (same source, place and message), counted.
create table public.error_reports (
  id bigint generated always as identity primary key,
  source text not null check (source in ('app', 'server')),
  fingerprint text not null unique,
  -- The screen (app) or route pattern (server), never an id.
  place text not null,
  message text not null,
  detail text,
  platform text,
  app_version text,
  count int not null default 1,
  last_user_id uuid references auth.users (id) on delete set null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  resolved_at timestamptz
);
create index error_reports_last_seen on public.error_reports (last_seen desc);
create index error_reports_last_user on public.error_reports (last_user_id);
alter table public.error_reports enable row level security;

-- Weekly summaries already sent (one per ISO week).
create table public.feedback_summaries (
  week_start date primary key,
  new_items int not null,
  open_items int not null,
  errors int not null,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.feedback_summaries enable row level security;
