-- Prayer Squire board (PrayerTower_ConceptDoc: "Public: Prayer Squire — public track,
-- visible on profile and leaderboard"; anonymous members are on the private Prayer
-- Warrior track and never appear). Off by default. Members opt in one by one; the
-- board ranks verified prayers for other people over a recent window, within the
-- viewer's own community.
alter table public.notebook_settings add column squire_board_enabled boolean not null default false;
alter table public.notebook_settings add column squire_board_days int not null default 30 check (squire_board_days between 1 and 365);
alter table public.profiles add column squire_public boolean not null default false;
