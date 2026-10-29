-- Scheduled radio sends (docs/STATION_OPERATOR_GUIDE.md, "Scheduled radio
-- sends"), from the Dominic notebook page: "2500 spent Friday, 2500 Saturday and
-- the rest at the start of the game", amplified. Off until an admin turns on
-- scheduled_radio_enabled. A scheduled spend can now send the request by radio
-- ('radio') or amplified ('amplify') at the chosen time instead of giving tokens
-- for reach ('reach', as before). The radio prayer's own price and rules apply
-- when it runs.
alter table public.token_settings add column scheduled_radio_enabled boolean not null default false;

alter table public.scheduled_spends
  add column action text not null default 'reach' check (action in ('reach', 'radio', 'amplify'));
