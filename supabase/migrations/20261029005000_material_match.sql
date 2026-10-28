-- Equal material help (Notes p3: "Even when paying for digital prayer
-- eternalization, MUST include equal material help for the afflicted").
-- Off by default. While on, every radio prayer paid with Priestly tokens
-- records a match: material help of equal value that the ministry owes the
-- afflicted, at cents_per_token (a placeholder rate for Steve to set). Admins
-- record the help when they send it, as a "help sent" entry in the Common
-- Prayer Fund, which marks the owed matches fulfilled. No money moves in the app.
create table public.material_match_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  cents_per_token int not null default 100 check (cents_per_token between 1 and 100000)
);
insert into public.material_match_settings default values;
alter table public.material_match_settings enable row level security;

create type public.material_match_status as enum ('owed', 'fulfilled', 'cancelled');

create table public.material_help_matches (
  id uuid primary key default public.uuid_v7(),
  radio_prayer_id uuid not null unique references public.radio_prayers (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  tokens int not null check (tokens > 0),
  cents int not null check (cents > 0),
  status public.material_match_status not null default 'owed',
  common_fund_entry_id uuid references public.common_fund_entries (id) on delete set null,
  fulfilled_by uuid references public.profiles (id) on delete set null,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now()
);
create index material_help_matches_owed on public.material_help_matches (created_at) where status = 'owed';
alter table public.material_help_matches enable row level security;
