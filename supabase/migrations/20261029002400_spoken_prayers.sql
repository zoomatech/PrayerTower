-- Spoken prayers (inventory: "Paid spoken-audio prayer", chat 10). A member who
-- prays for a request can record a short voice prayer for the requester. Off
-- by default. A requester receives them only after turning them on for that
-- request, and may offer tokens to each person who sends one (0 = free).

create table public.spoken_prayer_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  max_seconds int not null default 60 check (max_seconds between 10 and 300),
  -- The most tokens a requester may offer per spoken prayer (0 = spoken prayers are always free).
  max_offer_tokens int not null default 10 check (max_offer_tokens between 0 and 1000)
);
insert into public.spoken_prayer_settings default values;

-- A requester's opt-in for one request.
create table public.spoken_prayer_invites (
  post_id uuid primary key references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  offer_tokens int not null default 0 check (offer_tokens between 0 and 1000),
  created_at timestamptz not null default now()
);

create table public.spoken_prayers (
  id uuid primary key default public.uuid_v7(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,      -- who prayed
  recipient_id uuid not null references public.profiles (id) on delete cascade, -- the requester
  community_id uuid not null references public.communities (id),
  storage_path text not null unique,
  duration_seconds int not null check (duration_seconds between 1 and 300),
  offer_tokens int not null default 0,
  -- The token transfer that paid the offer, if one was paid.
  paid_transfer_id uuid,
  moderation_status public.moderation_status not null default 'visible',
  listened_at timestamptz,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);
create index spoken_prayers_recipient_idx on public.spoken_prayers (recipient_id, id desc);

alter table public.spoken_prayer_settings enable row level security;
alter table public.spoken_prayer_invites enable row level security;
alter table public.spoken_prayers enable row level security;

-- Audio bucket (private; uploaded and played through signed URLs from the API).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('spoken-prayers', 'spoken-prayers', false, 10485760,
        array['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/webm', 'audio/wav'])
on conflict (id) do nothing;
