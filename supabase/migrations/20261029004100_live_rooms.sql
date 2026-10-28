-- Live video rooms (notebook Page 7: live seminars; Page 4: video circles).
-- Off by default. Staff start a room; members of the same community see it under
-- "Live now" and join in an in-app browser. Rooms run on a Jitsi Meet server
-- (free, open-source software) at jitsi_url, or on a link the host pastes from
-- one of the allowed meeting sites in event settings. Nothing is recorded.

create table public.live_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  -- e.g. https://meet.example.org (your own Jitsi Meet server). Unset = hosts paste a link.
  jitsi_url text check (jitsi_url ~ '^https://[a-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9._/-]*)?$'),
  -- A room left open longer than this stops showing as live.
  max_minutes int not null default 180 check (max_minutes between 15 and 720)
);
insert into public.live_settings default values;

create table public.live_rooms (
  id uuid primary key default public.uuid_v7(),
  host_id uuid not null references public.profiles (id) on delete cascade,
  community_id uuid not null references public.communities (id),
  title text not null check (char_length(title) between 1 and 120),
  room_url text not null check (char_length(room_url) <= 500),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index live_rooms_open on public.live_rooms (community_id, started_at) where ended_at is null;

alter table public.live_settings enable row level security;
alter table public.live_rooms enable row level security;
