-- Prayer-to-prayee messages (notebook Features Set 2; Business Plan 3.5): the
-- person who posted a request and someone who prayed for it, committed to it
-- or commented on it can message each other about that request. General DMs
-- are not open yet. Every message runs the same safety checks as a comment
-- (AI scan, crisis support, reports, new-member limits), and either person
-- can block the other.

create table public.conversations (
  id uuid primary key default public.uuid_v7(),
  post_id uuid not null references public.posts (id) on delete cascade,
  community_id uuid not null references public.communities (id),
  -- The two people, stored in id order so a pair has one conversation per request.
  user_low uuid not null references public.profiles (id) on delete cascade,
  user_high uuid not null references public.profiles (id) on delete cascade,
  -- Shown as "Anonymous" to the other person (an anonymous post, or a pray-er
  -- whose only link to the request is anonymous).
  low_anonymous boolean not null default false,
  high_anonymous boolean not null default false,
  low_read_at timestamptz,
  high_read_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  check (user_low < user_high),
  unique (post_id, user_low, user_high)
);
create index conversations_low_idx on public.conversations (user_low, last_message_at desc);
create index conversations_high_idx on public.conversations (user_high, last_message_at desc);

create table public.messages (
  id uuid primary key default public.uuid_v7(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  community_id uuid not null references public.communities (id),
  body text not null check (char_length(body) between 1 and 2000),
  crisis boolean not null default false,
  moderation_status public.moderation_status not null default 'visible',
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, id);

-- A block stops all messages between the two people, both ways.
create table public.user_blocks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id),
  check (user_id <> blocked_id)
);

-- Admin switch: messages can be turned off for everyone.
alter table public.safety_settings add column messages_enabled boolean not null default true;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.user_blocks enable row level security;
