-- Gifts, not ads (Steve 2026-10-28): "from each according to his generosity, to
-- each according to his need". All off by default.
--   * donation_settings: the switch, the payment service (none until Steve picks
--     Stripe or Zeffy; keys are placeholders in the server's env) and the rates.
--   * donations: money given, by whom (or a guest), to whom: everyone (the shared
--     radio fund), one member, or a token pool. A paid gift adds Priestly tokens
--     to its target and regular tokens to the giver.
--   * Everybody gets at least one: each member's first `everyone_monthly` radio
--     prayers each month cost nothing, even while radio prayers cost tokens.
--   * radio_allocation_requests: a member asks for more; staff grant free radio
--     prayers (radio_allowances) paid from the shared fund.

create table public.donation_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  provider text not null default 'none' check (provider in ('none', 'stripe', 'zeffy')),
  -- Zeffy (or any hosted form): the page the Donate button opens.
  donate_url text,
  -- Stripe: the smallest and largest gift, in cents.
  min_cents integer not null default 100 check (min_cents >= 50),
  max_cents integer not null default 100000 check (max_cents >= min_cents),
  -- Placeholders until Steve sets them: Priestly tokens per dollar to the target,
  -- regular tokens per dollar to the giver.
  priestly_per_dollar integer not null default 1 check (priestly_per_dollar between 0 and 1000),
  regular_per_dollar integer not null default 10 check (regular_per_dollar between 0 and 10000),
  -- Everybody gets at least one.
  everyone_monthly integer not null default 1 check (everyone_monthly between 0 and 100),
  allocation_requests_enabled boolean not null default false,
  allocation_max_per_request integer not null default 3 check (allocation_max_per_request between 1 and 100)
);
insert into public.donation_settings default values;

create table public.donations (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid references public.profiles (id) on delete set null,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd',
  provider text not null check (provider in ('stripe', 'zeffy', 'manual')),
  provider_ref text,
  target_kind text not null default 'everyone' check (target_kind in ('everyone', 'member', 'pool')),
  target_user_id uuid references public.profiles (id) on delete set null,
  target_pool_id uuid references public.token_pools (id) on delete set null,
  show_donor boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded')),
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  check ((target_kind = 'member') = (target_user_id is not null)),
  check ((target_kind = 'pool') = (target_pool_id is not null))
);
create unique index donations_provider_ref on public.donations (provider, provider_ref) where provider_ref is not null;
create index donations_donor on public.donations (donor_id, created_at desc);

-- How a radio prayer was paid for: tokens, the monthly gift to everyone, or a granted allowance.
alter table public.radio_prayers
  add column funded_by text not null default 'tokens' check (funded_by in ('tokens', 'free', 'everyone', 'allowance'));

create table public.radio_allocation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  count integer not null check (count between 1 and 100),
  note text not null default '' check (length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'granted', 'declined')),
  granted integer,
  decided_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index radio_allocation_one_pending on public.radio_allocation_requests (user_id) where status = 'pending';

create table public.radio_allowances (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  remaining integer not null default 0 check (remaining >= 0),
  updated_at timestamptz not null default now()
);

alter table public.donation_settings enable row level security;
alter table public.donations enable row level security;
alter table public.radio_allocation_requests enable row level security;
alter table public.radio_allowances enable row level security;
