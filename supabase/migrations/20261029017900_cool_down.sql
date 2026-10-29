-- Cool-down (docs/GROWTH_PRACTICES.md). Off until Admin → Growth practices turns it on.
-- When two members trade three or more replies that the kind cloud's word rules would
-- flag (aimed insults, a stream of swearing, a threat) within a day, both are offered a
-- pause card with a gentle line. Nothing is ever blocked or held by this; the words
-- themselves are never stored here, only who replied to whom and when.
alter table public.practice_settings
  add column cool_down_enabled boolean not null default false;

create table public.heated_replies (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (from_id <> to_id)
);
create index heated_replies_from_idx on public.heated_replies (from_id, to_id, created_at desc);
create index heated_replies_to_idx on public.heated_replies (to_id);
alter table public.heated_replies enable row level security;

create table public.cool_downs (
  id uuid primary key default gen_random_uuid(),
  a_id uuid not null references public.profiles (id) on delete cascade,
  b_id uuid not null references public.profiles (id) on delete cascade,
  line int not null default 0,
  created_at timestamptz not null default now(),
  a_done text check (a_done in ('breather', 'okay')),
  b_done text check (b_done in ('breather', 'okay')),
  check (a_id < b_id)
);
create index cool_downs_a_idx on public.cool_downs (a_id, created_at desc);
create index cool_downs_b_idx on public.cool_downs (b_id, created_at desc);
alter table public.cool_downs enable row level security;
