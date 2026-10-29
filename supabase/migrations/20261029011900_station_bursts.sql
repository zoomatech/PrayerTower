-- A log of the station's bursts (docs/RADIO_BURST.md): each burst reports its
-- size, air time and, in simulate mode, how many prayers a receiver decoded back.
-- Admin → Radio shows the latest ones. Only the API reads or writes it.
create table public.station_bursts (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  call_sign text not null,
  mode text not null check (mode in ('audio', 'fldigi', 'simulate')),
  preset text not null,
  prayers integer not null check (prayers >= 0),
  frames integer not null check (frames >= 0),
  bytes integer not null check (bytes >= 0),
  seconds numeric(8, 2) not null check (seconds >= 0),
  -- Prayers decoded back from the burst audio (simulate mode); null when not checked.
  decoded integer check (decoded >= 0),
  ok boolean not null,
  error text
);
create index station_bursts_created_at_idx on public.station_bursts (created_at desc);
alter table public.station_bursts enable row level security;
