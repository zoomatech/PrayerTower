-- A path back after a removal: the removal notice tells the author they can post again
-- with changes, and the author (only) can get their own removed words back to edit.
-- Never for threats, flooding or automated accounts. Off by default.
alter table public.practice_settings add column path_back_enabled boolean not null default false;
