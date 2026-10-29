-- Lament posts (docs/GROWTH_PRACTICES.md). Off until Admin → Growth practices turns it
-- on. A member can mark a post as a lament: grief or anguish to be heard, not fixed.
-- The kind cloud doesn't nudge the author's swearing there, replies are invited to be
-- gentle with no advice (a nudge, never a block), and the post stays off the radio
-- unless the author says it may go out.
alter table public.practice_settings
  add column lament_enabled boolean not null default false;

alter table public.posts
  add column is_lament boolean not null default false,
  add column lament_radio boolean not null default false;
