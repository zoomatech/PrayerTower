-- Operator alerts (docs/STATION_OPERATOR_GUIDE.md, "Operator alerts"): push a
-- notice to every radio operator and admin when a station health problem
-- starts, and a quiet "back to normal" when it ends. Off by default.
alter table public.token_settings add column operator_alerts_enabled boolean not null default false;

-- Problems already announced, so each is sent once while it lasts.
create table public.radio_open_alerts (
  key text primary key,
  opened_at timestamptz not null default now()
);
alter table public.radio_open_alerts enable row level security;
