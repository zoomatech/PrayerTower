-- Encouragement partners (docs/GROWTH_PRACTICES.md). Off until Admin → Growth
-- practices turns it on. Members who opt in are paired with another member of their
-- community who also opted in, for partner_days (30), to check in on each other.
-- Either one can leave at any time: no reason is asked, and the other person sees
-- only that the partnership has ended. Never pairs across a block, and never pairs the
-- same two people again.
alter table public.practice_settings
  add column partners_enabled boolean not null default false,
  add column partner_days int not null default 30 check (partner_days between 7 and 90);

-- Waiting to be paired.
create table public.partner_pool (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now()
);
alter table public.partner_pool enable row level security;

create table public.partnerships (
  id uuid primary key default gen_random_uuid(),
  a_id uuid not null references public.profiles (id) on delete cascade,
  b_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  ended_at timestamptz,
  check (a_id <> b_id)
);
create index partnerships_a_idx on public.partnerships (a_id);
create index partnerships_b_idx on public.partnerships (b_id);
alter table public.partnerships enable row level security;

create table public.partner_checkins (
  id uuid primary key default gen_random_uuid(),
  partnership_id uuid not null references public.partnerships (id) on delete cascade,
  from_id uuid not null references public.profiles (id) on delete cascade,
  mood text not null check (mood in ('good', 'okay', 'hard')),
  note text check (length(note) <= 280),
  created_at timestamptz not null default now()
);
create index partner_checkins_partnership_idx on public.partner_checkins (partnership_id, created_at desc);
create index partner_checkins_from_idx on public.partner_checkins (from_id);
alter table public.partner_checkins enable row level security;
