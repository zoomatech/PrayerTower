-- Witness stories (Business Plan 7, "testimony engine": "answered-prayer posts
-- and, with permission, Witness team stories go back into the feed as proof").
-- A Witness member writes how someone was helped; it is shown only after the
-- person who was helped approves it, never with their name, and they can take
-- the approval back at any time. Off until an admin turns it on.
create type public.witness_story_status as enum ('awaiting_consent', 'approved', 'declined', 'withdrawn');

create table public.witness_stories (
  id uuid primary key default public.uuid_v7(),
  case_id uuid not null references public.witness_cases (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  status public.witness_story_status not null default 'awaiting_consent',
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
-- One open or shown story per case.
create unique index witness_stories_one_open on public.witness_stories (case_id) where status in ('awaiting_consent', 'approved');
create index witness_stories_shown on public.witness_stories (status, decided_at desc);
create index witness_stories_recipient on public.witness_stories (recipient_id);
alter table public.witness_stories enable row level security;

alter table public.notebook_settings add column witness_stories_enabled boolean not null default false;
