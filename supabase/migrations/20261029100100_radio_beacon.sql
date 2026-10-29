-- Reception beacon (docs/STATION_OPERATOR_GUIDE.md, "Reception beacon"): every
-- radio_beacon_minutes the station sends one short identified test burst, and
-- each listener node or listening page that decodes it is recorded with its
-- signal, so the operator sees reception through the day. Off by default. It
-- uses the setup wizard's test bursts, so the station needs no new code.
alter table public.token_settings
  add column radio_beacon_enabled boolean not null default false,
  add column radio_beacon_minutes integer not null default 60 check (radio_beacon_minutes between 15 and 360);

alter table public.radio_setup_tests add column beacon boolean not null default false;
create index radio_setup_tests_beacon_idx on public.radio_setup_tests (created_at) where beacon;

-- Every receiver that heard a beacon (a wizard test keeps only the first).
create table public.radio_beacon_heard (
  test_id uuid not null references public.radio_setup_tests (id) on delete cascade,
  heard_by text not null,
  snr_db real not null,
  peak_dbfs real,
  heard_at timestamptz not null default now(),
  primary key (test_id, heard_by)
);
alter table public.radio_beacon_heard enable row level security;
