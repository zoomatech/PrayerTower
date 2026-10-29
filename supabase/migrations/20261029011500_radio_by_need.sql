-- Radio prayers by need (Steve 2026-10-28: "from each according to his
-- generosity, to each according to his need"). Donations fill the shared fund
-- and the station sends prayers free; with radio_order = 'need' it picks the most
-- urgent request first, then the one with the fewest people praying, then the
-- oldest. 'oldest' (the default) keeps first in, first out.
alter table public.token_settings
  add column radio_order text not null default 'oldest' check (radio_order in ('oldest', 'need'));
