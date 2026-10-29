-- Station health alerts in Admin -> Radio (docs/STATION_OPERATOR_GUIDE.md, "Health alerts").
-- The station reports its own checks (audio device, rig/PTT) to POST /station/status;
-- the server adds what it can see (queue empty, a burst overdue, a failed burst).
-- Off until an admin turns it on.
alter table public.token_settings
  add column station_alerts_enabled boolean not null default false,
  add column station_overdue_minutes integer not null default 30 check (station_overdue_minutes between 1 and 1440);

-- The latest checks each station reported. Only the API reads or writes it.
create table public.station_status (
  call_sign text primary key,
  checks jsonb not null default '[]'::jsonb,
  reported_at timestamptz not null default now()
);
alter table public.station_status enable row level security;
