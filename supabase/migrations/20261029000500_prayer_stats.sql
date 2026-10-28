-- Gentle prayer stats on Me (days prayed, people prayed for, streak). On by
-- default; a member can turn them off. There is no leaderboard.
alter table public.profiles add column show_prayer_stats boolean not null default true;
