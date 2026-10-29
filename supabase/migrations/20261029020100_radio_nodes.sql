-- Radio nodes (docs/STATION_OPERATOR_GUIDE.md, "Listener nodes"): receive-only
-- listener nodes report what they decode (call sign, preset, SNR) so a station on
-- BURST_PRESET=auto picks its preset from real reception. Each node has its own
-- key (stored as a SHA-256 hash; shown once when an admin adds the node).
-- Reports are only taken while listener_reports_enabled is on (off by default).
alter table public.token_settings add column listener_reports_enabled boolean not null default false;

create table public.radio_nodes (
  id uuid primary key default public.uuid_v7(),
  name text not null check (char_length(name) between 1 and 60),
  role text not null default 'listener' check (role in ('listener', 'station')),
  key_hash text not null unique,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);
alter table public.radio_nodes enable row level security;

-- What each listener heard: the station's call sign, preset and measured SNR. Keeps the latest 2,000.
create table public.channel_reports (
  id bigint generated always as identity primary key,
  node_id uuid not null references public.radio_nodes (id) on delete cascade,
  call_sign text not null,
  preset text not null,
  snr_db numeric(5, 1) not null,
  heard_at timestamptz not null default now()
);
create index channel_reports_node_id_idx on public.channel_reports (node_id);
create index channel_reports_call_sign_heard_at_idx on public.channel_reports (call_sign, heard_at desc);
alter table public.channel_reports enable row level security;
