-- "Prayer without ceasing" (docs/STATION_OPERATOR_GUIDE.md, "Prayer without
-- ceasing"), from the notebook's Digital Prayer Signal Codec page. Off until an
-- admin turns on ceaseless_enabled. A member may mark their own request "keep
-- on the air"; whenever nothing else is waiting and the station has been quiet
-- for ceaseless_gap_minutes, one of those requests is sent again (free, kind
-- 'ceaseless'), the one sent longest ago first, so the air is never long silent.
alter table public.token_settings
  add column ceaseless_enabled boolean not null default false,
  add column ceaseless_gap_minutes integer not null default 30 check (ceaseless_gap_minutes between 5 and 240);

alter table public.posts add column keep_on_air boolean not null default false;
create index posts_keep_on_air_idx on public.posts (id) where keep_on_air;

alter table public.radio_prayers drop constraint radio_prayers_kind_check;
alter table public.radio_prayers add constraint radio_prayers_kind_check check (kind in ('prayer', 'thanksgiving', 'ceaseless'));
