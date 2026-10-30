-- Band plan and urgent prayers (docs/STATION_OPERATOR_GUIDE.md: "Band plan", "Urgent
-- prayers"). Both off by default.
--
-- band_plan_enabled: the bands the station may use (band_plan: label, frequency, FM or
-- USB, optional preset). On HF the server picks the band for each burst from NOAA SWPC's
-- solar flux and planetary K index, kept in space_weather (fetched every three hours
-- while the plan is on). The station reads the pick from GET /station/band.
-- urgent_radio_enabled: an admin or radio operator flags a request as urgent; it goes
-- first, with urgent_radio_repeats repeats, on a robust preset ('auto' = hf-robust on HF,
-- fm-robust-fec otherwise), alone in its burst. A listener's decode confirms it; one not
-- confirmed within urgent_radio_confirm_minutes goes out again, up to
-- urgent_radio_max_retries times.
alter table public.token_settings
  add column band_plan_enabled boolean not null default false,
  add column band_plan jsonb not null default '[]'::jsonb,
  add column space_weather jsonb,
  add column urgent_radio_enabled boolean not null default false,
  add column urgent_radio_repeats integer not null default 3 check (urgent_radio_repeats between 1 and 10),
  add column urgent_radio_preset text not null default 'auto',
  add column urgent_radio_confirm_minutes integer not null default 15 check (urgent_radio_confirm_minutes between 2 and 240),
  add column urgent_radio_max_retries integer not null default 2 check (urgent_radio_max_retries between 0 and 5);

alter table public.radio_prayers
  add column urgent boolean not null default false,
  add column urgent_flagged_by uuid references auth.users (id) on delete set null,
  add column urgent_flagged_at timestamptz,
  add column urgent_confirmed_at timestamptz,
  add column urgent_retries integer not null default 0;
create index radio_prayers_urgent_flagged_by_idx on public.radio_prayers (urgent_flagged_by);
create index radio_prayers_urgent_idx on public.radio_prayers (urgent_flagged_at) where urgent;
