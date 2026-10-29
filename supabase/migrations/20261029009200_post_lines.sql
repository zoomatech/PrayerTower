-- Post anatomy lines from Mockups 1 and 2, off until an admin turns it on (Admin → Notebook ideas):
-- a line extends from the poster's name with the post type in script above it, and a
-- line runs down the left of the post, so it is clear who each post belongs to.
alter table public.notebook_settings
  add column post_lines_enabled boolean not null default false;
