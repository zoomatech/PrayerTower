-- Gentle onboarding for the kindness tools: three short cards (the kind cloud, emoji
-- meanings, lament) shown once at the top of the feed. Off by default.
alter table public.practice_settings add column kindness_intro_enabled boolean not null default false;
