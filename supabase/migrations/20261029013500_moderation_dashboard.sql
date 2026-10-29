-- The moderator dashboard and the weekly report of what the harmful-prayer check
-- flagged (docs/HARMFUL_PRAYERS.md). Both off by default.
alter table public.moderator_care_settings
  add column dashboard_enabled boolean not null default false,
  add column weekly_report_enabled boolean not null default false;

-- Which word rules matched (e.g. "harm_wish:0"), so the lists can be tuned. Never the text.
alter table public.harm_events add column rules text[] not null default '{}';

create table public.harm_weekly_reports (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  report jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.harm_weekly_reports enable row level security;
