-- Notifications, push tokens, moderation queue and enforcement log.

create table public.notifications (
  id uuid primary key default public.uuid_v7(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}',
  -- Optional: suppresses repeats (e.g. one "praying right now" per pray-er per post per day).
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create unique index notifications_dedupe_uq on public.notifications (user_id, dedupe_key);

create table public.push_tokens (
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique,
  platform text check (platform in ('ios', 'android', 'web')),
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, token)
);

create type public.moderation_target as enum ('post', 'comment', 'reaction');
create type public.moderation_source as enum ('ai', 'report');
create type public.moderation_item_status as enum ('pending', 'actioned', 'dismissed');

create table public.moderation_items (
  id uuid primary key default public.uuid_v7(),
  target_type public.moderation_target not null,
  target_id uuid not null,
  -- The author of the flagged content (always stored, even when anonymous).
  user_id uuid not null references public.profiles (id) on delete cascade,
  source public.moderation_source not null,
  reporter_id uuid references public.profiles (id) on delete set null,
  reason text check (char_length(reason) <= 1000),
  ai_categories jsonb,
  auto_hidden boolean not null default false,
  status public.moderation_item_status not null default 'pending',
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index moderation_items_queue_idx on public.moderation_items (status, created_at);
create unique index moderation_items_one_report on public.moderation_items (target_type, target_id, reporter_id)
  where source = 'report';

create type public.moderation_action_kind as enum ('dismiss', 'restore', 'remove', 'forfeit_tokens', 'suspend', 'clawback');

-- Every enforcement decision, append-only.
create table public.moderation_actions (
  id uuid primary key default public.uuid_v7(),
  moderation_item_id uuid not null references public.moderation_items (id),
  user_id uuid not null references public.profiles (id),   -- the member acted on
  moderator_id uuid not null references public.profiles (id),
  action public.moderation_action_kind not null,
  token_transfer_id uuid references public.token_transfers (id),
  suspended_until timestamptz,
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

create trigger moderation_actions_no_update before update or delete on public.moderation_actions
  for each row execute function public.token_transfers_immutable();
