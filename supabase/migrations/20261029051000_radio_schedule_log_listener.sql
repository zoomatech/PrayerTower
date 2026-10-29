-- Station batch 5 (docs/STATION_OPERATOR_GUIDE.md: "Transmission windows",
-- "Operator log"; docs/RADIO_BURST.md: "Listener mode"). All off by default.
--
-- Transmission windows: while radio_schedule_enabled, the station is only handed
-- prayers inside one of radio_windows (days 0 = Sunday ... 6, "HH:MM" start and
-- end, an end before the start runs past midnight) and outside the quiet hours,
-- all in radio_schedule_tz. No windows means any time outside quiet hours.
alter table public.token_settings
  add column radio_schedule_enabled boolean not null default false,
  add column radio_schedule_tz text not null default 'UTC',
  add column radio_windows jsonb not null default '[]'::jsonb,
  add column radio_quiet_start text check (radio_quiet_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add column radio_quiet_end text check (radio_quiet_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  -- Operator log export (CSV) in Admin -> Radio.
  add column operator_log_enabled boolean not null default false,
  -- Listener mode: the app's Listen screen without an account, from the sign-in screen.
  add column listener_mode_enabled boolean not null default false;

-- What the station was handed (the exact text, after trimming) and the frequency it reported, for the operator log.
alter table public.radio_prayers
  add column sent_text text,
  add column frequency_hz bigint check (frequency_hz > 0);
