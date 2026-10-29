-- Radio prayers by need (Steve 2026-10-28: "from each according to his
-- generosity, to each according to his need"). Donations fill the shared fund
-- and the station sends prayers free; with radio_order = 'need' it picks the most
-- urgent request first, then the one with the fewest people praying, then the
-- oldest. 'oldest' (the default) keeps first in, first out.
alter table public.token_settings
  add column radio_order text not null default 'oldest' check (radio_order in ('oldest', 'need'));

-- Burst mode: the station may claim up to radio_batch_max prayers at once and
-- send them in one compressed transmission (apps/station, docs/RADIO_BURST.md).
-- 1 (the default) keeps one prayer per claim.
alter table public.token_settings
  add column radio_batch_max integer not null default 1 check (radio_batch_max between 1 and 500);
