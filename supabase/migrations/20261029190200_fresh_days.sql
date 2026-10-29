-- Fresh starts on days that matter (docs/GROWTH_PRACTICES.md), off. A member may save up to
-- three dates of their own (a birthday, a baptism, a sobriety date). On that day, and on the
-- first day of Advent, Ash Wednesday and Easter in communities with faith wording, "Your prayer
-- life" on Me invites a fresh start. Nothing is pushed, and nothing is said on other days.
alter table public.practice_settings add column fresh_days_enabled boolean not null default false;
create table public.fresh_start_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  month smallint not null check (month between 1 and 12),
  day smallint not null check (day between 1 and 31),
  label text not null check (char_length(label) between 1 and 40),
  created_at timestamptz not null default now()
);
create index fresh_start_days_user_idx on public.fresh_start_days (user_id);
alter table public.fresh_start_days enable row level security;
