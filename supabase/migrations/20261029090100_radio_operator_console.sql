-- Operator console (docs/STATION_OPERATOR_GUIDE.md, "Operator console"): one
-- screen for the control operator with the queue, the transmit window, the ID
-- timer, the log and two manual overrides. Off by default.
--   radio_paused: hold every transmission until the operator resumes.
--   radio_window_override_until: send outside the transmission windows and quiet
--   hours until this time (the operator's "on the air now" override).
alter table public.token_settings
  add column operator_console_enabled boolean not null default false,
  add column radio_paused boolean not null default false,
  add column radio_window_override_until timestamptz;
