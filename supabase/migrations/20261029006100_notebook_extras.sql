-- More notebook ideas, each off until an admin turns it on (Admin → Notebook ideas):
--   urgency_glow:  the urgency light on a post glows and pulses for urgent requests (PM doc 3.8).
--   reaction_tray: long-press a post for "Light a candle" / "Standing with you" reactions (PM doc 3.8).
--   member_town:   members can add a town to their profile, shown only inside their own community (Dev Plan 3.5).
--   prize_choice:  an annual award winner chooses to keep, donate or split the prize (PM doc 2).
alter table public.notebook_settings
  add column urgency_glow_enabled boolean not null default false,
  add column reaction_tray_enabled boolean not null default false,
  add column member_town_enabled boolean not null default false,
  add column prize_choice_enabled boolean not null default false;
