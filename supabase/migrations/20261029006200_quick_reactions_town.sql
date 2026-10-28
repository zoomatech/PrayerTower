-- Quick reactions (long-press a post): "Light a candle" and "Standing with you".
-- One of each per member per post; shown only while reaction_tray_enabled is on.
create table public.quick_reactions (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('candle', 'standing')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, kind)
);
create index quick_reactions_user_idx on public.quick_reactions (user_id);
alter table public.quick_reactions enable row level security;

-- An optional town on the profile ("Carol in Albuquerque"), shown only to members
-- of the same community while member_town_enabled is on.
alter table public.profiles add column town text check (town is null or char_length(town) between 1 and 60);
