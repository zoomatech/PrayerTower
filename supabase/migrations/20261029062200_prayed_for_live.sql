-- "Praying for you now" Live Activity (roadmap/Growth_Ideas_Big_Platforms_Missed.md,
-- idea 3, the part that wasn't built). A member may put one of their own open
-- requests on their Lock Screen for up to 8 hours; it updates as people pray. The
-- app sends the activity's push token; the worker sends Apple an update when the
-- count changes. First names only, never anyone who prayed anonymously, never the
-- request's words. Off until Admin → Growth turns it on, and quiet until the server
-- has an Apple push key (APNS_KEY_ID, APNS_PRIVATE_KEY; docs/GROWTH.md).
alter table public.growth_settings add column prayed_for_live_enabled boolean not null default false;

create table public.live_activities (
  id uuid primary key default public.uuid_v7(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  push_token text not null unique check (push_token ~ '^[0-9a-f]+$' and char_length(push_token) between 16 and 400),
  -- The app's bundle ID (Prayer Tower, Open Circle or staging): the push topic.
  app_id text not null check (char_length(app_id) between 3 and 100),
  last_people int not null default 0,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index live_activities_open_idx on public.live_activities (created_at) where ended_at is null;
create index live_activities_user_idx on public.live_activities (user_id);
create index live_activities_post_idx on public.live_activities (post_id);
alter table public.live_activities enable row level security;
