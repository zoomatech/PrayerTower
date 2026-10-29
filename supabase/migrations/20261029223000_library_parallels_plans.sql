-- Parallels and reading plans for Text search (docs/LIBRARY_SEARCH.md), both off by default and only
-- while text search itself is on.
-- Parallels: curated related passages side by side across texts (data/library/parallels.json); no tables.
-- Reading plans: curated plans (data/library/plans.json), read in the app from the library's own texts.
-- A member follows a plan at their own pace, can read it together with one of their prayer circles,
-- and gets at most one gentle evening reminder on a day they haven't read, which stops after two
-- weeks with no reading. Open Circle is offered only the plans with no Bible or Apocrypha in them.
alter table public.library_settings add column parallels_enabled boolean not null default false;
alter table public.library_settings add column plans_enabled boolean not null default false;

create table public.library_plan_follows (
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_id text not null check (plan_id ~ '^[a-z0-9-]{1,40}$'),
  -- Reading together: circle members who follow the plan with the same circle see how many read each day.
  circle_id uuid references public.prayer_circles (id) on delete set null,
  reminders boolean not null default true,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  last_reminded_on date,
  primary key (user_id, plan_id)
);
create index library_plan_follows_circle_idx on public.library_plan_follows (circle_id, plan_id);
alter table public.library_plan_follows enable row level security;

create table public.library_plan_reads (
  user_id uuid not null,
  plan_id text not null,
  day int not null check (day between 1 and 400),
  read_at timestamptz not null default now(),
  primary key (user_id, plan_id, day),
  foreign key (user_id, plan_id) references public.library_plan_follows (user_id, plan_id) on delete cascade
);
alter table public.library_plan_reads enable row level security;
