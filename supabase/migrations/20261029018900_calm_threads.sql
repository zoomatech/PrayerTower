-- Calm threads: when a comment thread heats up (three comments the kind cloud would flag,
-- from at least two people, within two hours), everyone in it sees a calm, Ted Lasso-style
-- note, and the thread goes to a moderator. Only a moderator can slow it down (one comment
-- every 10 minutes per person, for a few hours); nothing is blocked automatically.
-- Only who commented and when is kept, never the words. Off by default.
alter table public.practice_settings add column calm_threads_enabled boolean not null default false;

create table public.heated_comments (
  id uuid primary key default public.uuid_v7(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index heated_comments_post_idx on public.heated_comments (post_id, created_at);
create index heated_comments_user_id_idx on public.heated_comments (user_id);
alter table public.heated_comments enable row level security;

create table public.calm_threads (
  post_id uuid primary key references public.posts (id) on delete cascade,
  started_at timestamptz not null default now(),
  -- warm: waiting for a moderator; slow: a moderator slowed it; settled: a moderator said it's fine.
  status text not null default 'warm' check (status in ('warm', 'slow', 'settled')),
  slow_until timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz
);
create index calm_threads_decided_by_idx on public.calm_threads (decided_by);
alter table public.calm_threads enable row level security;
