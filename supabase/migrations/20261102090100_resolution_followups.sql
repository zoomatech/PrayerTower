-- Answered-prayer follow-ups (Steve, 2026-11-02): ask the next day, then each week after
-- (days 1, 8, 15 and 22), by notification. Admin → Prayer resolution can still change it.
alter table public.resolution_settings alter column first_days set default 1;
alter table public.resolution_settings alter column again_days set default 7;
alter table public.resolution_settings alter column max_asks set default 4;
update public.resolution_settings set first_days = 1, again_days = 7, max_asks = 4
 where first_days = 14 and again_days = 30 and max_asks = 3;
