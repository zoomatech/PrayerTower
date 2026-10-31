-- Groups (Steve, 2026-10-31): open topic groups like Facebook groups, separate from prayer
-- circles and study rooms. Anyone in the community can find a group, join it, post to its own
-- feed, comment and pray. Group posts stay in the group: never on the main feed, the radio,
-- search or digests. Any member can start a group and leads it; a group Prayer Tower starts
-- has no member as its leader. The first group is "Cancer survivors".
-- Admin → Growth practices switch (Steve, 2026-10-31: "a switch for activating Circles and one
-- for groups"). On, since Steve ordered groups; turning it off hides Groups everywhere.
alter table public.practice_settings add column topic_groups_enabled boolean not null default true;

create table public.topic_groups (
  id uuid primary key default public.uuid_v7(),
  community_id uuid not null default public.default_community_id() references public.communities (id),
  name text not null check (char_length(name) between 1 and 60),
  about text check (char_length(about) <= 300),
  leader_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index topic_groups_community_id_idx on public.topic_groups (community_id);
create index topic_groups_leader_id_idx on public.topic_groups (leader_id);
alter table public.topic_groups enable row level security;

create table public.topic_group_members (
  group_id uuid not null references public.topic_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index topic_group_members_user_id_idx on public.topic_group_members (user_id);
alter table public.topic_group_members enable row level security;

create table public.topic_group_posts (
  id uuid primary key default public.uuid_v7(),
  group_id uuid not null references public.topic_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index topic_group_posts_group_idx on public.topic_group_posts (group_id, created_at desc);
create index topic_group_posts_user_id_idx on public.topic_group_posts (user_id);
alter table public.topic_group_posts enable row level security;

create table public.topic_group_comments (
  id uuid primary key default public.uuid_v7(),
  post_id uuid not null references public.topic_group_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index topic_group_comments_post_idx on public.topic_group_comments (post_id, created_at);
create index topic_group_comments_user_id_idx on public.topic_group_comments (user_id);
alter table public.topic_group_comments enable row level security;

create table public.topic_group_prayers (
  post_id uuid not null references public.topic_group_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index topic_group_prayers_user_id_idx on public.topic_group_prayers (user_id);
alter table public.topic_group_prayers enable row level security;

insert into public.topic_groups (name, about)
values ('Cancer survivors', 'For cancer survivors to pray for, encourage and get to know one another.');
