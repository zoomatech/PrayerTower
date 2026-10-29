-- Listener batch (docs/STATION_OPERATOR_GUIDE.md: "Listener sign-up",
-- "Thank-you cards", "Weekly station report"). All off by default.
--
-- listener_signup_enabled: a public page (/listeners, and /open-circle/listeners)
-- where anyone with an RTL-SDR dongle or a radio asks to run a listener node. An
-- admin approves each one; approval makes a one-use setup link, good for 14 days.
-- The link opens a guided Pi or Mac setup page that makes the node's key once (only
-- its hash is kept, as for every node), so the key never waits in the database.
-- qsl_cards_enabled: a listener node whose report matched prayers the station really
-- sent gets a digital thank-you card (like a ham radio QSL card), one per station
-- call sign per UTC day, at an unguessable /qsl/<token> link.
-- station_report_enabled: a weekly station report for admins and radio operators
-- (bursts sent, prayers delivered, listener coverage, problems) in Admin → Radio and
-- the operator console; station_report_email also emails it on Monday mornings.
alter table public.token_settings
  add column listener_signup_enabled boolean not null default false,
  add column qsl_cards_enabled boolean not null default false,
  add column station_report_enabled boolean not null default false,
  add column station_report_email boolean not null default false;

create table public.listener_signups (
  id uuid primary key default public.uuid_v7(),
  name text not null check (char_length(name) between 1 and 60),
  email text not null check (char_length(email) <= 320),
  place text not null default '' check (char_length(place) <= 80),
  -- About a city (0.1 degree), only if they offered it.
  lat numeric(4, 1) check (lat between -90 and 90),
  lon numeric(4, 1) check (lon between -180 and 180),
  receiver text not null check (receiver in ('rtl-sdr', 'radio', 'not-sure')),
  platform text not null check (platform in ('pi', 'mac', 'other')),
  call_sign text check (char_length(call_sign) <= 10),
  note text not null default '' check (char_length(note) <= 300),
  edition text not null default 'prayer-tower' check (edition in ('prayer-tower', 'open-circle')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'joined')),
  setup_token_hash text unique,
  setup_expires_at timestamptz,
  node_id uuid references public.radio_nodes (id) on delete set null,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index listener_signups_pending_email_idx on public.listener_signups (lower(email)) where status = 'pending';
create index listener_signups_node_idx on public.listener_signups (node_id);
create index listener_signups_reviewed_by_idx on public.listener_signups (reviewed_by);
alter table public.listener_signups enable row level security;

-- Which edition's words a node's cards use; set when a sign-up makes the node.
alter table public.radio_nodes add column edition text not null default 'prayer-tower' check (edition in ('prayer-tower', 'open-circle'));

create table public.qsl_cards (
  id uuid primary key default public.uuid_v7(),
  token text not null unique,
  node_id uuid not null references public.radio_nodes (id) on delete cascade,
  call_sign text not null,
  day date not null,
  -- The station's running card number, as printed on the card.
  serial integer not null,
  preset text not null,
  best_snr_db real not null,
  prayers integer not null default 0,
  first_heard_at timestamptz not null default now(),
  last_heard_at timestamptz not null default now(),
  unique (node_id, call_sign, day)
);
alter table public.qsl_cards enable row level security;

create table public.station_reports (
  week_start date primary key,
  report jsonb not null,
  created_at timestamptz not null default now(),
  emailed_at timestamptz
);
alter table public.station_reports enable row level security;

-- Problems as they started (operator-alerts.ts), so the weekly report can count them.
create table public.radio_alert_history (
  id bigint generated always as identity primary key,
  kind text not null,
  call_sign text,
  detail text,
  opened_at timestamptz not null default now()
);
create index radio_alert_history_opened_idx on public.radio_alert_history (opened_at);
alter table public.radio_alert_history enable row level security;
