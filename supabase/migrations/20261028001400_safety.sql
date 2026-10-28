-- Safe messaging and troll prevention (see the Troll Prevention and Safe
-- Messaging Rules doc). Crisis posts stay up, get support signposting, and go
-- to a person for review; new members have limits until they have prayed.

alter table public.posts add column crisis boolean not null default false;
alter table public.comments add column crisis boolean not null default false;

-- One crisis item per piece of content.
create unique index moderation_items_one_crisis on public.moderation_items (target_type, target_id)
  where source = 'crisis';

create table public.safety_settings (
  id boolean primary key default true check (id),
  new_member_limits_enabled boolean not null default true,
  new_member_hours int not null default 24 check (new_member_hours between 0 and 8760),
  new_member_min_prayers int not null default 5 check (new_member_min_prayers between 0 and 10000),
  new_member_posts_per_day int not null default 3 check (new_member_posts_per_day between 0 and 1000),
  new_member_comments_per_day int not null default 10 check (new_member_comments_per_day between 0 and 1000),
  new_member_links_allowed boolean not null default false
);
insert into public.safety_settings default values;
alter table public.safety_settings enable row level security;
