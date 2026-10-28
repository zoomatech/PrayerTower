-- "Not for me": a member hides a post from their own feed (Ethel scrolls past
-- prayers that don't speak to her). Hidden posts never come back for them.
create table public.hidden_posts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
alter table public.hidden_posts enable row level security;
