-- Giving split (Steve, 2026-10-29): when a gift credits a member, a share can go
-- to the member's own Ko-fi or Zeffy page. Tokens are never cash and the app never
-- holds anyone's money, so the split is the giver's: the app shows the member's
-- page and the share, and a money gift through Give is made smaller by that share
-- when the giver chooses to split. Off until Admin → Giving split turns it on.
create table public.giving_split_settings (
  id boolean primary key default true check (id),
  giving_split_enabled boolean not null default false,
  -- The most a member can ask to go to their own page.
  max_percent int not null default 50 check (max_percent between 1 and 100)
);
insert into public.giving_split_settings default values;
alter table public.giving_split_settings enable row level security;

-- The share a member asks for (0 = none). Needs profiles.support_url.
alter table public.profiles add column giving_split_percent smallint not null default 0 check (giving_split_percent between 0 and 100);
