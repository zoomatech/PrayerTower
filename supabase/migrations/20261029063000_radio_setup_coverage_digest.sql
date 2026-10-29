-- Station batch 7 (docs/STATION_OPERATOR_GUIDE.md: "Setup wizard", "Coverage map",
-- "Weekly radio digest"). All off by default.
--
-- radio_setup_wizard_enabled: Admin → Radio walks a new operator through setup:
-- pick the radio (radio_setup holds the choice, used to write the settings
-- lines), play a test tone to set audio levels, send a test burst, and confirm a
-- listener decoded it. Each tone or burst is one radio_setup_tests row that the
-- station picks up (GET /station/setup-test) and reports on.
-- coverage_map_enabled: listener nodes that opt in send an approximate location,
-- rounded to about a city (0.1 degree, roughly 11 km); Admin → Radio shows them on
-- a map with the signal each one hears. radio_station_lat/lon is the station's own
-- dot, also rounded.
-- radio_digest_enabled: a weekly summary of radio prayers (aired, heard, answered)
-- in Admin → Radio; radio_digest_email also emails it to admins on Monday mornings.
alter table public.token_settings
  add column radio_setup_wizard_enabled boolean not null default false,
  add column radio_setup jsonb not null default '{}'::jsonb,
  add column coverage_map_enabled boolean not null default false,
  add column coverage_tile_url text not null default '',
  add column radio_station_lat numeric(4, 1) check (radio_station_lat between -90 and 90),
  add column radio_station_lon numeric(4, 1) check (radio_station_lon between -180 and 180),
  add column radio_digest_enabled boolean not null default false,
  add column radio_digest_email boolean not null default false;

create table public.radio_setup_tests (
  id uuid primary key default public.uuid_v7(),
  kind text not null check (kind in ('tone', 'burst')),
  status text not null default 'requested' check (status in ('requested', 'sending', 'sent', 'heard', 'failed')),
  -- Tone length; a burst's text carries `code` so its fingerprint is unique.
  seconds integer not null default 10 check (seconds between 3 and 30),
  code text not null,
  sent_hash text,
  call_sign text,
  preset text,
  peak_dbfs real,
  heard_by text,
  heard_snr_db real,
  heard_peak_dbfs real,
  error text,
  requested_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  heard_at timestamptz
);
create index radio_setup_tests_requested_by_idx on public.radio_setup_tests (requested_by);
create index radio_setup_tests_open_idx on public.radio_setup_tests (created_at) where status in ('requested', 'sending', 'sent');
alter table public.radio_setup_tests enable row level security;

alter table public.radio_nodes
  add column place text check (char_length(place) <= 80),
  add column lat numeric(4, 1) check (lat between -90 and 90),
  add column lon numeric(4, 1) check (lon between -180 and 180);

create table public.radio_digests (
  week_start date primary key,
  aired integer not null,
  heard integer not null,
  answered integer not null,
  thanksgiving integer not null,
  praying_too integer not null,
  failed integer not null,
  created_at timestamptz not null default now(),
  emailed_at timestamptz
);
alter table public.radio_digests enable row level security;
