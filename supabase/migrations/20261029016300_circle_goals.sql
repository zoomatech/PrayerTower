-- Circle goals (research/Contributing_Without_Ad_Money.md, suggestion 9): a shared,
-- visible goal on a request, such as "50 people pray for this by Sunday". Progress
-- counts real prayers by different people. Off by default.
alter table public.notebook_settings add column circle_goals_enabled boolean not null default false;

create table public.circle_goals (
  post_id uuid primary key references public.posts (id) on delete cascade,
  set_by uuid not null references public.profiles (id) on delete cascade,
  target int not null check (target between 2 and 10000),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  check (ends_at > starts_at)
);
create index circle_goals_set_by_fk_idx on public.circle_goals (set_by);
alter table public.circle_goals enable row level security;
