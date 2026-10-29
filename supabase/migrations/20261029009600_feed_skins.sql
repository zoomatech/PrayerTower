-- Feed skins (Steve, 2026-10-29): the feed grows by lines and connectors that
-- can look like a vine, a beanstalk or an elven tree, or be one solid wall of
-- full-screen posts. Skins are rows in feed_themes; colors, line widths and
-- copy are theme tokens, so a new skin needs no app release. Everything here
-- is off until an admin turns it on (Admin → Feed skins).
alter type public.feed_layout add value if not exists 'wall';

create table public.skin_settings (
  id boolean primary key default true check (id),
  -- Shows the gated skins (feed_themes.gated) in Me → Feed style.
  skins_enabled boolean not null default false,
  -- Comments under a request grow as branches and leaves.
  comment_tree_enabled boolean not null default false,
  -- Leaves shown on a branch before the rest fade into a blur ("and 12 more").
  comment_tree_leaves int not null default 5 check (comment_tree_leaves between 1 and 20),
  -- Replies to replies stop at this depth while the tree is on (0 = top-level comments only).
  comment_tree_max_depth int not null default 2 check (comment_tree_max_depth between 0 and 6),
  -- Members can propose a skin; admins approve or decline it.
  proposals_enabled boolean not null default false,
  -- Longest video a member can attach, in seconds. 7 keeps clips short
  -- until the platform is ready for longer video (docs/FEED_SKINS.md).
  video_max_seconds int not null default 7 check (video_max_seconds between 1 and 600)
);
insert into public.skin_settings default values;
alter table public.skin_settings enable row level security;

-- A gated theme is offered only while skins_enabled is on.
alter table public.feed_themes add column gated boolean not null default false;

create table public.theme_proposals (
  id uuid primary key default public.uuid_v7(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  community_id uuid not null references public.communities (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 40),
  description text not null check (char_length(description) between 1 and 500),
  layout text not null check (layout in ('vine', 'wall')),
  -- Proposed colors: stem, leaf and backdrop, as #RRGGBB.
  colors jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  review_note text check (char_length(review_note) <= 500),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  theme_id uuid references public.feed_themes (id) on delete set null,
  created_at timestamptz not null default now()
);
create index theme_proposals_user_id_fk_idx on public.theme_proposals (user_id);
create index theme_proposals_community_id_fk_idx on public.theme_proposals (community_id);
create index theme_proposals_reviewed_by_fk_idx on public.theme_proposals (reviewed_by);
create index theme_proposals_theme_id_fk_idx on public.theme_proposals (theme_id);
create index theme_proposals_pending_idx on public.theme_proposals (created_at) where status = 'pending';
alter table public.theme_proposals enable row level security;
