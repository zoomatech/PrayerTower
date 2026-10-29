-- The member safety center (docs/SAFETY_CENTER.md): one place to report, block, mute
-- and hide, with what you did listed so it can be undone. Off by default.
create table public.safety_center_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.safety_center_settings default values;
alter table public.safety_center_settings enable row level security;

-- Muting is quieter than blocking: their posts and comments leave your feed, nothing
-- else changes, and they are not told.
create table public.user_mutes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  muted_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, muted_id),
  check (user_id <> muted_id)
);
create index user_mutes_muted on public.user_mutes (muted_id);
alter table public.user_mutes enable row level security;
