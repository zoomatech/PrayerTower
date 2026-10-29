-- Scripture and ancient writings search, ported from Winstons Syndicate (Steve,
-- 2026-10-29: "the bible search feature FROM winston's syndicate needs to be added
-- here"; it will grow to search other ancient texts). Off by default. The texts ship
-- with the server (apps/server/data/library); only public-domain works are included.
-- The Bible (KJV) is never offered in a community with neutral wording (Open Circle);
-- the ancient writings are offered to every community.
create table public.library_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false
);
insert into public.library_settings default values;
alter table public.library_settings enable row level security;
