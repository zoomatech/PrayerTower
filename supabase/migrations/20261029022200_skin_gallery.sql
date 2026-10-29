-- Skin gallery (docs/FEED_SKINS.md, Skin gallery): Me → Skin gallery shows every skin a
-- member can use, with a live preview, who made it, likes, and "Use this skin". Off until
-- Admin → Feed skins → Skin gallery is on.
alter table public.skin_settings add column gallery_enabled boolean not null default false;

create table public.theme_likes (
  theme_id uuid not null references public.feed_themes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (theme_id, user_id)
);
create index theme_likes_user_id_idx on public.theme_likes (user_id);
-- The API reads and writes likes; nothing is exposed to clients directly.
alter table public.theme_likes enable row level security;
