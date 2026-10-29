-- Gentle "check back": the person who asked picks a day to be reminded to share how it's
-- going, and when they post an update, everyone who prayed gets one quiet in-app heads-up
-- (no push), at most once a day per request. Off by default.
alter table public.practice_settings add column check_back_enabled boolean not null default false;

create table public.check_backs (
  post_id uuid primary key references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  due_at timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index check_backs_user_id_idx on public.check_backs (user_id);
create index check_backs_due_idx on public.check_backs (due_at) where sent_at is null;

alter table public.check_backs enable row level security;
