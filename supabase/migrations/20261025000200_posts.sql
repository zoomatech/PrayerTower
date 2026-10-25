-- Posts, media, comments, reactions.

create type public.post_type as enum ('prayer_request', 'praise', 'open_prayer', 'testimony', 'confessional');
-- 'amplified' stays dormant until the broadcast ships.
create type public.post_state as enum ('open', 'actively_prayed', 'amplified', 'answered');
create type public.moderation_status as enum ('visible', 'hidden_pending_review', 'removed');

create or replace function public.word_count(t text) returns int
language sql immutable as $$
  select case when btrim(t) = '' then 0
              else array_length(regexp_split_to_array(btrim(t), '\s+'), 1) end;
$$;

create table public.posts (
  id uuid primary key default public.uuid_v7(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_type public.post_type not null,
  kind text check (char_length(kind) <= 60),
  realm text check (char_length(realm) <= 60),
  urgency smallint not null default 0 check (urgency between 0 and 3),
  body text not null check (char_length(body) between 1 and 10000 and public.word_count(body) <= 1000),
  background text check (char_length(background) <= 60),
  is_anonymous boolean not null default false,
  -- Trauma/gory content; hidden from users who opted out.
  is_sensitive boolean not null default false,
  state public.post_state not null default 'open',
  answered_at timestamptz,
  moderation_status public.moderation_status not null default 'visible',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((state = 'answered') = (answered_at is not null))
);
create index posts_recent_idx on public.posts (created_at desc) where moderation_status = 'visible';
create index posts_user_idx on public.posts (user_id, created_at desc);

create trigger posts_touch before update on public.posts
  for each row execute function public.touch_updated_at();

create type public.media_kind as enum ('image', 'video');

create table public.post_media (
  id uuid primary key default public.uuid_v7(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.media_kind not null,
  storage_path text not null,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (post_id, position)
);

create table public.comments (
  id uuid primary key default public.uuid_v7(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid references public.comments (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  -- An update from the post's author; may be bumped into the first-comment slot.
  is_update boolean not null default false,
  is_anonymous boolean not null default false,
  moderation_status public.moderation_status not null default 'visible',
  created_at timestamptz not null default now()
);
create index comments_post_idx on public.comments (post_id, created_at);

create type public.reaction_kind as enum ('encouragement', 'well_wishes', 'share');

create table public.reactions (
  id uuid primary key default public.uuid_v7(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.reaction_kind not null,
  -- Encouragement notes are capped at 77 characters; share intros are one line.
  note text,
  is_anonymous boolean not null default false,
  moderation_status public.moderation_status not null default 'visible',
  created_at timestamptz not null default now(),
  check (kind <> 'encouragement' or (note is not null and char_length(note) between 1 and 77)),
  check (kind <> 'share' or note is null or (char_length(note) <= 140 and note !~ '\n')),
  check (kind <> 'well_wishes' or note is null)
);
create index reactions_post_idx on public.reactions (post_id, kind);
create unique index reactions_one_well_wish on public.reactions (post_id, user_id) where kind = 'well_wishes';

-- Thanks from the requester to a pray-er.
create table public.thanks (
  id uuid primary key default public.uuid_v7(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,   -- sender (poster)
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  icon text not null default 'heart' check (char_length(icon) <= 30),
  message text check (char_length(message) <= 77),
  created_at timestamptz not null default now()
);

-- Media bucket (private; read via signed URLs from the API).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-media', 'post-media', false, 104857600,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime'])
on conflict (id) do nothing;
