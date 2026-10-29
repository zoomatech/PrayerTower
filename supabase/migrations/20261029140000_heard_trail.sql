-- "Where it was heard" (docs/STATION_OPERATOR_GUIDE.md, "Where it was heard"),
-- from the HAM Operators notebook page: "a trail of all the places / ears that
-- have tracked or heard that prayer", with real reports only, never an
-- estimate. Off until an admin turns on heard_trail_enabled. Each listener node
-- that decodes a radio prayer is kept with its name and signal; phones and
-- listening pages stay anonymous and are only counted.
alter table public.token_settings add column heard_trail_enabled boolean not null default false;

create table public.radio_prayer_heard (
  id bigint generated always as identity primary key,
  radio_prayer_id uuid not null references public.radio_prayers (id) on delete cascade,
  node_id uuid references public.radio_nodes (id) on delete set null,
  heard_by text check (char_length(heard_by) between 1 and 60),
  snr_db real not null,
  heard_at timestamptz not null default now()
);
create index radio_prayer_heard_prayer_idx on public.radio_prayer_heard (radio_prayer_id);
create unique index radio_prayer_heard_node_uq on public.radio_prayer_heard (radio_prayer_id, node_id) where node_id is not null;
create index radio_prayer_heard_node_idx on public.radio_prayer_heard (node_id);
alter table public.radio_prayer_heard enable row level security;
revoke all on public.radio_prayer_heard from anon, authenticated;
