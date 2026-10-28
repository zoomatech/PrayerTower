-- Scheduled token spending (roadmap Phase 2): give tokens to a request at a
-- set time, e.g. Friday evening or a game's start, once or weekly. Tokens are
-- taken when it runs, not reserved; if the member is short then, it fails
-- and they are told.

create table public.scheduled_spends (
  id uuid primary key default public.uuid_v7(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  amount int not null check (amount between 1 and 10000),
  next_run_at timestamptz not null,
  repeat_weeks int not null default 1 check (repeat_weeks between 1 and 52),
  runs int not null default 0,
  status text not null default 'active' check (status in ('active', 'done', 'cancelled', 'failed')),
  error text,
  created_at timestamptz not null default now()
);
create index scheduled_spends_due_idx on public.scheduled_spends (next_run_at) where status = 'active';
create index scheduled_spends_user_idx on public.scheduled_spends (user_id, created_at desc);
alter table public.scheduled_spends enable row level security;
