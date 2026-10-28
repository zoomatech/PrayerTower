-- Podcasts (Notes p7: "live seminars, podcasts, in-app video"). Off by default
-- (notebook_settings.podcasts_enabled). Staff publish shows and episodes; the
-- audio is hosted elsewhere and linked by URL. Members listen in the app, and
-- each published show has a public RSS feed for podcast apps
-- (/podcasts/<slug>/feed.xml), following Apple's feed requirements.
alter table public.notebook_settings add column podcasts_enabled boolean not null default false;

create table public.podcast_shows (
  id uuid primary key default public.uuid_v7(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  -- Members of this community see it in the app (null: everyone).
  community_id uuid references public.communities (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null check (char_length(description) between 1 and 4000),
  author text not null check (char_length(author) between 1 and 120),
  -- Square artwork, 1400 to 3000 pixels (Apple Podcasts).
  image_url text check (image_url is null or image_url ~ '^https://'),
  category text not null default 'Religion & Spirituality' check (char_length(category) <= 80),
  published boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger podcast_shows_touch before update on public.podcast_shows for each row execute function public.touch_updated_at();
alter table public.podcast_shows enable row level security;

create table public.podcast_episodes (
  id uuid primary key default public.uuid_v7(),
  show_id uuid not null references public.podcast_shows (id) on delete cascade,
  -- Never changes, so podcast apps don't list an episode twice.
  guid uuid not null unique default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 4000),
  audio_url text not null check (audio_url ~ '^https://'),
  audio_bytes bigint not null default 0 check (audio_bytes >= 0),
  audio_type text not null default 'audio/mpeg' check (audio_type in ('audio/mpeg', 'audio/x-m4a', 'audio/mp4', 'audio/aac')),
  duration_seconds int check (duration_seconds is null or duration_seconds > 0),
  episode_number int check (episode_number is null or episode_number > 0),
  -- Null: a draft, not in the app or the feed.
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (show_id, audio_url)
);
create index podcast_episodes_show on public.podcast_episodes (show_id, published_at desc);
alter table public.podcast_episodes enable row level security;
