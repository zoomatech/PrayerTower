-- Listening and circle study rooms for Text search (docs/LIBRARY_SEARCH.md), both off by default and only
-- while text search itself is on.
-- Listening: read any passage aloud with the device's own voice, and play a public-domain LibriVox recording
-- (with its reader's credit) where one exists for that place. Each member's place in what they listened to is
-- kept (library_listening), so they can pick up where they left off and see their listening history.
-- Study rooms: a prayer circle picks a passage or a reading-plan day and talks it over. A study is a circle
-- post carrying the passage (so the circle's kind cloud, blocks and take-downs all apply), and its talk is the
-- post's replies, which may now answer one another (one level deep).
alter table public.library_settings add column listen_enabled boolean not null default false;
alter table public.library_settings add column studies_enabled boolean not null default false;

alter table public.circle_posts add column study_collection text check (study_collection ~ '^[a-z0-9-]{1,40}$');
alter table public.circle_posts add column study_key text check (char_length(study_key) <= 64);
alter table public.circle_posts add column study_ref text check (char_length(study_ref) <= 200);
alter table public.circle_posts add column study_quote text check (char_length(study_quote) <= 1500);
alter table public.circle_posts add column study_citation text check (char_length(study_citation) <= 300);
alter table public.circle_posts add column study_plan_id text check (char_length(study_plan_id) <= 80);
alter table public.circle_posts add column study_plan_day int check (study_plan_day between 1 and 400);
alter table public.circle_posts add constraint circle_posts_study_whole check (
  (study_key is null) = (study_collection is null) and (study_key is null) = (study_citation is null)
);
create index circle_posts_study_idx on public.circle_posts (circle_id, created_at desc) where study_key is not null;

alter table public.circle_replies add column parent_id uuid references public.circle_replies (id) on delete cascade;
create index circle_replies_parent_idx on public.circle_replies (parent_id) where parent_id is not null;

-- Where each member left off, one row per passage and way of listening (the device's voice, or a recording),
-- newest first is their listening history. Only the server reads it; members see only their own.
create table public.library_listening (
  id uuid primary key default public.uuid_v7(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  collection text not null check (collection ~ '^[a-z0-9-]{1,40}$'),
  passage_key text not null check (char_length(passage_key) <= 64),
  ref text not null check (char_length(ref) <= 200),
  citation text not null check (char_length(citation) <= 300),
  kind text not null check (kind in ('voice', 'recording')),
  -- The device's voice: characters of the passage already read. A recording: seconds already played.
  position numeric not null default 0 check (position >= 0),
  -- A recording's length in seconds, when known.
  duration numeric check (duration >= 0),
  recording_title text check (char_length(recording_title) <= 300),
  finished boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, collection, passage_key, kind)
);
create index library_listening_user_idx on public.library_listening (user_id, updated_at desc);
alter table public.library_listening enable row level security;
