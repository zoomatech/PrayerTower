-- Prayer circles: an invite-only small group (up to 12 people) with its own gentle feed.
-- Posts and replies stay inside the circle: never on the main feed, the radio, search or
-- digests. No counts are shown except to the person who asked. Off by default.
alter table public.practice_settings add column prayer_circles_enabled boolean not null default false;

create table public.prayer_circles (
  id uuid primary key default public.uuid_v7(),
  name text not null check (char_length(name) between 1 and 60),
  about text check (char_length(about) <= 300),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index prayer_circles_owner_id_idx on public.prayer_circles (owner_id);
alter table public.prayer_circles enable row level security;

create table public.prayer_circle_members (
  circle_id uuid not null references public.prayer_circles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);
create index prayer_circle_members_user_id_idx on public.prayer_circle_members (user_id);
alter table public.prayer_circle_members enable row level security;

-- One invite code at a time per circle; the owner can make a new one, which retires the old.
create table public.prayer_circle_invites (
  code text primary key check (code ~ '^[A-Z0-9]{8}$'),
  circle_id uuid not null unique references public.prayer_circles (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index prayer_circle_invites_created_by_idx on public.prayer_circle_invites (created_by);
alter table public.prayer_circle_invites enable row level security;

create table public.circle_posts (
  id uuid primary key default public.uuid_v7(),
  circle_id uuid not null references public.prayer_circles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index circle_posts_circle_idx on public.circle_posts (circle_id, created_at desc);
create index circle_posts_user_id_idx on public.circle_posts (user_id);
alter table public.circle_posts enable row level security;

create table public.circle_replies (
  id uuid primary key default public.uuid_v7(),
  circle_post_id uuid not null references public.circle_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index circle_replies_post_idx on public.circle_replies (circle_post_id, created_at);
create index circle_replies_user_id_idx on public.circle_replies (user_id);
alter table public.circle_replies enable row level security;

create table public.circle_prayed (
  circle_post_id uuid not null references public.circle_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (circle_post_id, user_id)
);
create index circle_prayed_user_id_idx on public.circle_prayed (user_id);
alter table public.circle_prayed enable row level security;
