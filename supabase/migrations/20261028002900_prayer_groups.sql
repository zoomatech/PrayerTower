-- Prayer groups (notebook Features Set 2; Business Plan 3.5, 9.3): topical
-- group chats with a shared prayer list. A public group anyone can find and
-- join; a private group is joined with its invite code. Group messages use
-- the same messages table, so they get the same scan, report, crisis and
-- new-member checks as private messages.

create table public.prayer_groups (
  id uuid primary key default public.uuid_v7(),
  community_id uuid not null references public.communities (id),
  name text not null check (char_length(name) between 1 and 60),
  purpose text not null default '' check (char_length(purpose) <= 500),
  is_private boolean not null default false,
  invite_code text not null unique default substr(md5(gen_random_uuid()::text), 1, 12),
  created_by uuid not null references public.profiles (id),
  last_message_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index prayer_groups_public_idx on public.prayer_groups (created_at desc) where not is_private and archived_at is null;

create type public.group_role as enum ('leader', 'member');

create table public.prayer_group_members (
  group_id uuid not null references public.prayer_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.group_role not null default 'member',
  read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index prayer_group_members_user_idx on public.prayer_group_members (user_id);

-- The group's shared prayer list: requests members add for the group to pray over.
create table public.prayer_group_posts (
  group_id uuid not null references public.prayer_groups (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  added_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (group_id, post_id)
);

-- A message belongs to a private conversation or to a group, never both.
alter table public.messages alter column conversation_id drop not null;
alter table public.messages add column group_id uuid references public.prayer_groups (id) on delete cascade;
alter table public.messages add constraint messages_one_place check ((conversation_id is null) <> (group_id is null));
create index messages_group_idx on public.messages (group_id, id) where group_id is not null;

-- Placeholder: groups one member can lead at once.
alter table public.safety_settings add column groups_per_member int not null default 5 check (groups_per_member between 0 and 100);

alter table public.prayer_groups enable row level security;
alter table public.prayer_group_members enable row level security;
alter table public.prayer_group_posts enable row level security;
