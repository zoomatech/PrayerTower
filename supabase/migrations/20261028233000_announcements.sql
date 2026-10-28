-- In-app announcements: an admin posts a banner (one line across the top of the
-- feed) or a notice (a card with a title and text) to every member. Members
-- dismiss each one for themselves. Spanish text is optional; members using the
-- app in Spanish see it when it is there, and the English otherwise.
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'banner' check (kind in ('banner', 'notice')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null default '' check (char_length(body) <= 1000),
  title_es text check (title_es is null or char_length(btrim(title_es)) between 1 and 120),
  body_es text check (body_es is null or char_length(body_es) <= 1000),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index announcements_recent_idx on public.announcements (created_at desc);
alter table public.announcements enable row level security;

create table public.announcement_dismissals (
  user_id uuid not null references public.profiles (id) on delete cascade,
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, announcement_id)
);
create index announcement_dismissals_announcement_idx on public.announcement_dismissals (announcement_id);
alter table public.announcement_dismissals enable row level security;
