-- Several stations sharing one queue (docs/STATION_OPERATOR_GUIDE.md, "Several stations").
-- Each extra station is a radio node with role 'station' and its own key. Claims
-- already lock rows (for update skip locked), so two stations never get the same
-- prayer; claimed_by_node records which station holds a claim, and only that
-- station may report its result. The main station (STATION_API_KEY) claims with null.
-- Extra stations' keys work only while multi_station_enabled is on (off by default).
alter table public.token_settings add column multi_station_enabled boolean not null default false;
alter table public.radio_prayers add column claimed_by_node uuid references public.radio_nodes (id) on delete set null;
create index radio_prayers_claimed_by_node_idx on public.radio_prayers (claimed_by_node);
