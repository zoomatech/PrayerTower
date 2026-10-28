-- Power Prayer (notebook Page 10, roadmap Phase 2): spread a request to a
-- number of live pray-ers who don't know the poster. Limited free, then
-- tokens. Every number here is a placeholder until Steve sets it (the
-- roadmap lists the reach number as UNSET).

create table public.reach_settings (
  id boolean primary key default true check (id),
  power_prayer_reach int not null default 10 check (power_prayer_reach between 1 and 1000),
  power_prayer_free_per_week int not null default 1 check (power_prayer_free_per_week between 0 and 100),
  power_prayer_cost int not null default 5 check (power_prayer_cost between 1 and 10000),
  -- A member gets at most this many Power Prayer asks a day, so strangers' asks never become noise.
  power_prayer_max_per_recipient_day int not null default 3 check (power_prayer_max_per_recipient_day between 1 and 100),
  -- "Live" pray-ers: prayed for someone within this many days.
  power_prayer_active_days int not null default 14 check (power_prayer_active_days between 1 and 365)
);
insert into public.reach_settings default values;
alter table public.reach_settings enable row level security;

create table public.power_prayers (
  id uuid primary key default public.uuid_v7(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  cost int not null check (cost >= 0),
  transfer_id uuid unique references public.token_transfers (id),
  reached int not null default 0,
  idempotency_key text not null check (char_length(idempotency_key) <= 100),
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check ((cost = 0) = (transfer_id is null))
);
create index power_prayers_user_idx on public.power_prayers (user_id, created_at desc);

-- Who was asked, so nobody is asked twice about the same request.
create table public.power_prayer_recipients (
  power_prayer_id uuid not null references public.power_prayers (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index power_prayer_recipients_user_idx on public.power_prayer_recipients (user_id, created_at desc);

alter table public.power_prayers enable row level security;
alter table public.power_prayer_recipients enable row level security;
