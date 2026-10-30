-- Signal journey (20261030031000) is removed at Steve's request: it was not in his specs.
alter table public.token_settings drop column if exists signal_journey_enabled;
