-- Kindness weather report: an anonymous weekly view of community tone for admins, built
-- only from totals (warm signals against heated ones). No per-member scores; quiet weeks
-- are folded. Off by default.
alter table public.practice_settings add column kindness_weather_enabled boolean not null default false;
