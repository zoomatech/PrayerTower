-- Fair air (docs/STATION_OPERATOR_GUIDE.md, "Fair air"), from two notebook
-- pages. Both off by default.
--
-- radio_every_request_enabled (Notes p2: "a lack of tokens will NEVER stop a
-- prayer request from being seen & minimally broadcast"): every new prayer
-- request that may go on the radio is sent once, free (kind 'auto'), after the
-- prayers members sent themselves.
-- radio_member_daily_cap (Donor Influence page: people "paying to amplify those
-- prayers, on BOTH SIDES" to "flood the zone"): at most this many radio sends
-- per member in 24 hours, amplified ones counting each time they go out. Null
-- is no cap.
alter table public.token_settings
  add column radio_every_request_enabled boolean not null default false,
  add column radio_member_daily_cap integer check (radio_member_daily_cap between 1 and 1000);

alter table public.radio_prayers drop constraint radio_prayers_kind_check;
alter table public.radio_prayers add constraint radio_prayers_kind_check check (kind in ('prayer', 'thanksgiving', 'ceaseless', 'auto'));
create unique index radio_prayers_auto_uq on public.radio_prayers (post_id) where kind = 'auto';
