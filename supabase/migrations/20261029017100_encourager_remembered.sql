-- Two more growth practices (research/Personal_Growth_Research.md), both off until
-- Admin → Growth practices turns them on.
--   1. Encourager: a newcomer can ask for one welcoming volunteer for their first
--      days here. Either side ends it with one tap, no reason shown, and it ends
--      on its own. No shared streak and no "your encourager is waiting".
--   2. Answered & remembered: a look-back the member opens when they choose,
--      showing only their own answered requests with a grateful word. Requests
--      that speak of a death or loss never show, and any item can be hidden.
alter table public.practice_settings
  add column encourager_enabled boolean not null default false,
  add column encourager_days int not null default 30 check (encourager_days between 7 and 90),
  -- A newcomer is someone whose account is younger than this.
  add column newcomer_days int not null default 30 check (newcomer_days between 1 and 365),
  add column remembered_enabled boolean not null default false;

create table public.encourager_volunteers (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- They agreed to the community rules and the encourager guidelines.
  agreed_at timestamptz not null default now(),
  max_newcomers smallint not null default 2 check (max_newcomers between 1 and 5)
);
alter table public.encourager_volunteers enable row level security;

create table public.encourager_matches (
  id uuid primary key default public.uuid_v7(),
  newcomer_id uuid not null references public.profiles (id) on delete cascade,
  encourager_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  ended_at timestamptz,
  check (newcomer_id <> encourager_id)
);
-- One open match per newcomer.
create unique index encourager_matches_open_idx on public.encourager_matches (newcomer_id) where ended_at is null;
create index encourager_matches_encourager_idx on public.encourager_matches (encourager_id);
alter table public.encourager_matches enable row level security;

create table public.remembered_hidden (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  primary key (user_id, post_id)
);
alter table public.remembered_hidden enable row level security;
create index encourager_matches_newcomer_idx on public.encourager_matches (newcomer_id);
create index remembered_hidden_post_idx on public.remembered_hidden (post_id);
