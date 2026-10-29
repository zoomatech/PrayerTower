-- "What would Ted Lasso do?" (Steve, 2026-10-29): a small cloud in the corner of
-- the composer with a short prayer and "Are you sure you want to put that out
-- there?" when a post or reply looks aimed at someone. It never stops a post,
-- except one with a threat or excessive foul language. Swearing out of anguish
-- ("this f***ing cancer") is fine. Off by default; when on, the cloud replaces
-- the older rules warning and the server refuses threats and excessive swearing.
alter table public.notebook_settings
  add column kind_cloud_enabled boolean not null default false;
