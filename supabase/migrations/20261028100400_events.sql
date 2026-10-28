-- Prayer meetings, local meet-ups and events (notebook Page 9 #7, Page 12
-- EVENTS, Page 7 "live seminars, Zoom meets"). V1 has no in-app video: an
-- event carries a link to a video meeting on an allowed host, a place, or both.

create type public.event_kind as enum ('prayer_meeting', 'meetup', 'seminar', 'outreach', 'circle');
create type public.rsvp_status as enum ('going', 'maybe');

create table public.events (
  id uuid primary key default public.uuid_v7(),
  community_id uuid not null default public.default_community_id() references public.communities (id),
  created_by uuid not null references public.profiles (id) on delete cascade,
  kind public.event_kind not null default 'prayer_meeting',
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  starts_at timestamptz not null,
  duration_minutes int not null default 60 check (duration_minutes between 5 and 1440),
  video_url text check (char_length(video_url) <= 500),
  -- Free text: a church, a park, a city. Shown to everyone who can see the event.
  location text check (char_length(location) <= 200),
  -- A group's event is seen only by the group's members.
  conversation_id uuid references public.conversations (id) on delete cascade,
  moderation_status public.moderation_status not null default 'visible',
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  check (video_url is not null or location is not null)
);
create index events_upcoming_idx on public.events (community_id, starts_at) where cancelled_at is null and moderation_status = 'visible';

create table public.event_rsvps (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.rsvp_status not null default 'going',
  reminded_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.event_settings (
  id boolean primary key default true check (id),
  events_enabled boolean not null default true,
  -- New members (see safety_settings) can join events but not host them.
  new_members_can_host boolean not null default false,
  -- Video links must be on one of these hosts (or a subdomain), to keep out phishing links.
  allowed_video_hosts text[] not null default array['zoom.us', 'meet.google.com', 'teams.microsoft.com', 'teams.live.com', 'youtube.com', 'youtu.be', 'facebook.com', 'vimeo.com', 'whereby.com', 'meet.jit.si'],
  reminder_minutes int not null default 30 check (reminder_minutes between 0 and 1440)
);
insert into public.event_settings default values;

alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;
alter table public.event_settings enable row level security;
