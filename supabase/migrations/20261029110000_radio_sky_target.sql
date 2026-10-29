-- Sky target (docs/STATION_OPERATOR_GUIDE.md, "Dish and sky target"): the
-- notebook's dish idea (a consumer parabolic dish pointed at the sky). Prayer
-- Tower works out where a target is from the station (straight up, the Moon,
-- Alpha Centauri or any RA/Dec), shows it on the operator console, can turn a
-- Hamlib rotator to follow it (station ROTATOR=rotctld), and can hold
-- transmissions while the target is below a minimum elevation. Off by default.
alter table public.token_settings
  add column sky_target_enabled boolean not null default false,
  add column sky_target text not null default 'zenith' check (sky_target in ('zenith', 'moon', 'alpha_centauri', 'custom')),
  add column sky_custom_ra_hours numeric(7, 4) check (sky_custom_ra_hours >= 0 and sky_custom_ra_hours < 24),
  add column sky_custom_dec_deg numeric(7, 4) check (sky_custom_dec_deg between -90 and 90),
  add column sky_custom_name text check (char_length(sky_custom_name) <= 40),
  -- The dish's location, to about 1 km (pointing needs no more).
  add column sky_lat numeric(5, 2) check (sky_lat between -90 and 90),
  add column sky_lon numeric(6, 2) check (sky_lon between -180 and 180),
  add column sky_min_elevation integer not null default 10 check (sky_min_elevation between 0 and 60),
  add column sky_hold_below boolean not null default false;
