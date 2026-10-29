-- Kind words practice: a private weekly card on Me with a short, made-up situation and three
-- possible replies; choosing one shows what each reply does, gently. No scores, no streaks,
-- and nothing a member chooses is stored. Off by default.
alter table public.practice_settings add column empathy_practice_enabled boolean not null default false;
