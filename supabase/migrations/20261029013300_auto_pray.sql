-- Auto-Pray AI intercession (founding pitch; docs/AUTO_PRAY.md). Off by default.
-- A request's author can opt in; an AI then writes a short prayer for it on a
-- schedule. AI prayers are labeled, counted on their own, and never touch human
-- prayer counts, tokens, tiers or the radio. Nothing is sent to an AI until an
-- admin turns the switch on AND the server has ANTHROPIC_API_KEY.

alter table public.ai_settings
  add column auto_pray_enabled boolean not null default false,
  -- AI prayers per opted-in request per day.
  add column auto_pray_per_day smallint not null default 1 check (auto_pray_per_day between 1 and 4),
  -- All AI prayers per day across the app (cost limit).
  add column auto_pray_daily_limit int not null default 100 check (auto_pray_daily_limit between 1 and 10000),
  -- An opt-in ends after this many days.
  add column auto_pray_days smallint not null default 30 check (auto_pray_days between 1 and 365);

-- Requests whose authors turned Auto-Pray on.
create table public.auto_pray_requests (
  post_id uuid primary key references public.posts (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.auto_pray_requests enable row level security;

create table public.ai_prayers (
  id uuid primary key default public.uuid_v7(),
  post_id uuid not null references public.posts (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index ai_prayers_post_id_fk_idx on public.ai_prayers (post_id, created_at);
create index ai_prayers_created_at on public.ai_prayers (created_at);
alter table public.ai_prayers enable row level security;

