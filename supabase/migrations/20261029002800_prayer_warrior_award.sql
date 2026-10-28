-- Annual Prayer Warrior Award (Business Plan 6.4). Off by default. An admin
-- picks the year's top pray-ers from the standings (verified prayers for
-- others and kept promises); each winner accepts or declines, and chooses
-- whether their name appears in the public Hall of Prayer Warriors. Token
-- prizes are paid on acceptance. Any other prize (e.g. cash) is only described
-- here (prize_note) and handled outside the app by the people responsible.
create table public.award_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  winners int not null default 3 check (winners between 1 and 50),
  token_prize int not null default 0 check (token_prize between 0 and 100000),
  priestly_prize int not null default 0 check (priestly_prize between 0 and 100000),
  prize_note text not null default '' check (char_length(prize_note) <= 500),
  public_hall boolean not null default true
);
insert into public.award_settings default values;

create type public.award_status as enum ('offered', 'accepted', 'declined');

create table public.prayer_warrior_awards (
  id uuid primary key default public.uuid_v7(),
  year int not null check (year between 2025 and 2200),
  rank int not null check (rank >= 1),
  user_id uuid not null references public.profiles (id) on delete cascade,
  prayers int not null,
  checkins int not null,
  people int not null,
  status public.award_status not null default 'offered',
  show_name boolean not null default false,
  token_transfer_id uuid,
  priestly_transfer_id uuid,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (year, user_id),
  unique (year, rank)
);

alter table public.award_settings enable row level security;
alter table public.prayer_warrior_awards enable row level security;
