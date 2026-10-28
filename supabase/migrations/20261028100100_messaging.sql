-- Features Set 2 (notebook Page 9): pray-er-to-prayee messages, general direct
-- messages, and prayer & topical group chats, all in one conversation model.
-- Every message can be reported or AI-flagged into the same moderation queue.
-- Moderators only ever see a message that was reported or flagged.

create type public.conversation_kind as enum ('prayer', 'direct', 'group');
create type public.conversation_member_status as enum ('invited', 'active', 'declined', 'left');

create table public.conversations (
  id uuid primary key default public.uuid_v7(),
  kind public.conversation_kind not null,
  community_id uuid not null default public.default_community_id() references public.communities (id),
  -- Prayer threads: the request the pray-er prayed for.
  post_id uuid references public.posts (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  -- Groups only.
  title text check (char_length(title) between 1 and 80),
  topic text check (char_length(topic) <= 280),
  is_public boolean not null default false,
  closed_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  check ((kind = 'prayer') = (post_id is not null)),
  check ((kind = 'group') = (title is not null)),
  check (kind = 'group' or not is_public)
);
-- One prayer thread per pray-er per request.
create unique index conversations_one_prayer on public.conversations (post_id, created_by) where kind = 'prayer';
create index conversations_public_groups on public.conversations (community_id, last_message_at desc nulls last)
  where kind = 'group' and is_public and closed_at is null;

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  is_owner boolean not null default false,
  status public.conversation_member_status not null default 'active',
  -- Pray-er threads: whether this member shows as Anonymous to the others.
  is_anonymous boolean not null default false,
  invited_by uuid references public.profiles (id) on delete set null,
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members (user_id, status);

create table public.messages (
  id uuid primary key default public.uuid_v7(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  community_id uuid not null references public.communities (id),
  body text not null check (char_length(body) between 1 and 2000),
  moderation_status public.moderation_status not null default 'visible',
  crisis boolean not null default false,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, id desc);
create index messages_user_day_idx on public.messages (user_id, created_at desc);

-- A member blocks another: neither can message the other, and the blocker
-- doesn't see the other's messages, posts or comments.
create table public.user_blocks (
  user_id uuid not null references public.profiles (id) on delete cascade,     -- blocker
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id),
  check (user_id <> blocked_id)
);
create index user_blocks_blocked_idx on public.user_blocks (blocked_id);

-- Admin switches and limits. Defaults are placeholders until Steve decides.
create table public.messaging_settings (
  id boolean primary key default true check (id),
  prayer_messages_enabled boolean not null default true,
  -- Who can start a pray-er thread: anyone who prayed for the request (false = only those who committed).
  prayer_messages_any_prayer boolean not null default true,
  direct_messages_enabled boolean not null default true,
  -- General messages only between members who follow each other.
  direct_requires_mutual_follow boolean not null default true,
  groups_enabled boolean not null default true,
  -- Until someone accepts, the starter can send this many messages (Instagram-style message request).
  request_message_limit int not null default 1 check (request_message_limit between 1 and 20),
  -- New members (see safety_settings) can reply but not start conversations or groups.
  new_members_can_start boolean not null default false,
  new_member_messages_per_day int not null default 20 check (new_member_messages_per_day between 0 and 10000),
  group_max_members int not null default 200 check (group_max_members between 2 and 100000)
);
insert into public.messaging_settings default values;

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.user_blocks enable row level security;
alter table public.messaging_settings enable row level security;
