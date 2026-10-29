-- Two growth practices, both off (docs/GROWTH_PRACTICES.md):
--   Weekly intention: a member may choose how many days a week they mean to pray (1 to 6, so
--   at least one rest day is built in). Me shows the days they showed up, which only adds; a
--   week that falls short is never mentioned.
--   Community health: weekly totals for admins of what matters (requests that felt held,
--   prayers answered, members who came back), never time spent in the app.
alter table public.practice_settings
  add column weekly_intention_enabled boolean not null default false,
  add column community_health_enabled boolean not null default false;
alter table public.profiles add column weekly_intention smallint check (weekly_intention between 1 and 6);
