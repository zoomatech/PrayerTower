-- Monitoring (docs/MONITORING.md): when the worker and the radio station last
-- checked in, and the API's server errors (5xx), for Admin → Operations and the
-- ops alerts. Server-only tables: no member can read them.
create table public.ops_heartbeats (
  name text primary key check (name in ('worker', 'station')),
  seen_at timestamptz not null default now()
);
alter table public.ops_heartbeats enable row level security;

create table public.server_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  method text not null,
  route text not null,
  status int not null
);
create index server_errors_at on public.server_errors (at);
alter table public.server_errors enable row level security;
