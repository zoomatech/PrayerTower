-- Circle welcome: the person who started a circle writes a short, warm welcome (its norms).
-- Someone posting in the circle for the first time sees it above the composer and can
-- dismiss it, and the starter gets a quiet nudge to say hello. Off by default.
alter table public.practice_settings add column circle_welcome_enabled boolean not null default false;
alter table public.prayer_circles add column welcome text check (char_length(welcome) <= 400);

create table public.circle_welcome_seen (
  circle_id uuid not null references public.prayer_circles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);
create index circle_welcome_seen_user_id_idx on public.circle_welcome_seen (user_id);
alter table public.circle_welcome_seen enable row level security;
