-- Communities (sandboxes). V1 runs one Christian ecumenical feed, but every
-- post and everything attached to it belongs to a community, so separately
-- branded sandboxes (other denominations, faiths, groups) can be added later
-- on the same backend by inserting rows, not migrating data.
-- Design: roadmap/Prayer_Tower_Community_Data_Model.md (project files).
--
-- Platform-wide: profiles, follows, token ledger, push tokens (one account and
-- one balance per person). Community-scoped: posts and their children,
-- moderation, prompts. Configurable per community: roles, tier names.

create type public.community_status as enum ('active', 'hidden', 'archived');

create table public.communities (
  id uuid primary key default public.uuid_v7(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  name text not null check (char_length(name) between 1 and 80),
  -- Broad tradition: 'christian' in V1; free text so new faiths need no migration.
  tradition text not null check (char_length(tradition) between 1 and 60),
  status public.community_status not null default 'active',
  is_default boolean not null default false,
  -- Presentation read by a sandbox's front end (unused in V1).
  vocabulary jsonb not null default '{}',
  theme jsonb not null default '{}',
  enabled_post_types public.post_type[] not null default '{prayer_request,praise,open_prayer,testimony,confessional}',
  enabled_reactions public.reaction_kind[] not null default '{encouragement,well_wishes,share}',
  contributes_to_global_count boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index communities_one_default on public.communities (is_default) where is_default;
create trigger communities_touch before update on public.communities
  for each row execute function public.touch_updated_at();

insert into public.communities (slug, name, tradition, is_default)
values ('christian-ecumenical', 'Prayer Tower', 'christian', true);

create or replace function public.default_community_id() returns uuid
language sql stable as $$
  select id from public.communities where is_default;
$$;

-- How a front end resolves its sandbox (app host or bundle id).
create table public.community_domains (
  host text primary key,
  community_id uuid not null references public.communities (id) on delete cascade
);

create table public.community_memberships (
  community_id uuid not null references public.communities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- The community a member's new posts go to when the client does not say.
  is_primary boolean not null default false,
  -- Per-sandbox presentation; null = use the profile's value.
  display_name text check (char_length(display_name) <= 80),
  anonymous_by_default boolean,
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);
create unique index community_memberships_one_primary on public.community_memberships (user_id) where is_primary;
create index community_memberships_user_idx on public.community_memberships (user_id);

insert into public.community_memberships (community_id, user_id, is_primary)
select public.default_community_id(), id, true from public.profiles;

-- New members join the default community.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  insert into public.community_memberships (community_id, user_id, is_primary)
  values (public.default_community_id(), new.id, true);
  return new;
end;
$$;

-- community_id on posts and every row attached to a post ----------------------

alter table public.posts
  add column community_id uuid not null default public.default_community_id() references public.communities (id);
drop index public.posts_recent_idx;
create index posts_community_recent_idx on public.posts (community_id, created_at desc) where moderation_status = 'visible';

-- Children always take their post's community, so a row can never leak into
-- another sandbox and queries filter on one indexed column.
create or replace function public.copy_post_community() returns trigger
language plpgsql as $$
begin
  select community_id into strict new.community_id from public.posts where id = new.post_id;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['post_media', 'comments', 'reactions', 'thanks', 'commitments', 'prayer_events', 'prayer_prompts'] loop
    execute format('alter table public.%I add column community_id uuid references public.communities (id)', t);
    execute format('update public.%I c set community_id = p.community_id from public.posts p where p.id = c.post_id', t);
    execute format('alter table public.%I alter column community_id set not null', t);
    execute format('create index %I on public.%I (community_id)', t || '_community_idx', t);
    execute format('create trigger %I before insert or update of post_id, community_id on public.%I
                    for each row execute function public.copy_post_community()', t || '_community', t);
  end loop;
end;
$$;

-- Moderation items take the community of the flagged content; actions take their item's.
alter table public.moderation_items add column community_id uuid references public.communities (id);
update public.moderation_items set community_id = public.default_community_id();
alter table public.moderation_items alter column community_id set not null;
drop index public.moderation_items_queue_idx;
create index moderation_items_queue_idx on public.moderation_items (community_id, status, created_at);

alter table public.moderation_actions add column community_id uuid references public.communities (id);
update public.moderation_actions a set community_id = i.community_id from public.moderation_items i where i.id = a.moderation_item_id;
alter table public.moderation_actions alter column community_id set not null;

create or replace function public.copy_moderation_item_community() returns trigger
language plpgsql as $$
begin
  select community_id into strict new.community_id from public.moderation_items where id = new.moderation_item_id;
  return new;
end;
$$;
create trigger moderation_actions_community before insert on public.moderation_actions
  for each row execute function public.copy_moderation_item_community();

-- Notifications: the sandbox the event happened in; null = platform-wide (e.g. a weekly review).
alter table public.notifications add column community_id uuid references public.communities (id);

-- Roles and tier names can be per community; null = platform-wide -----------

alter table public.user_roles add column community_id uuid references public.communities (id);
alter table public.user_roles drop constraint user_roles_pkey;
create unique index user_roles_scope on public.user_roles
  (user_id, role, coalesce(community_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Tier progress stays per person; only names/thresholds may differ by sandbox.
alter table public.tier_settings add column community_id uuid references public.communities (id);
alter table public.tier_settings drop constraint tier_settings_pkey;
alter table public.tier_settings drop constraint tier_settings_rank_key;
create unique index tier_settings_scope on public.tier_settings
  (tier, coalesce(community_id, '00000000-0000-0000-0000-000000000000'::uuid));
create unique index tier_settings_rank_scope on public.tier_settings
  (rank, coalesce(community_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Later: posts.reach_scope ('community' | 'global') for cross-sandbox praying
-- and the anonymous global prayer count. Not needed while there is one community.

-- Feed themes ------------------------------------------------------------------
-- The feed API returns layout-neutral cards; the client's renderer for the
-- theme's layout decides structure and animation (column now, vine later).
-- No position, tilt or animation is ever stored on posts.

create type public.feed_layout as enum ('column', 'vine', 'carousel');

create table public.feed_themes (
  id uuid primary key default public.uuid_v7(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  name text not null check (char_length(name) <= 80),
  layout public.feed_layout not null,
  card_templates jsonb not null default '{}',
  animations jsonb not null default '{}',
  tokens jsonb not null default '{}',
  status text not null default 'active' check (status in ('active', 'beta', 'retired')),
  created_at timestamptz not null default now()
);

create table public.community_feed_themes (
  community_id uuid not null references public.communities (id) on delete cascade,
  theme_id uuid not null references public.feed_themes (id) on delete cascade,
  is_default boolean not null default false,
  primary key (community_id, theme_id)
);
create unique index community_feed_themes_one_default on public.community_feed_themes (community_id) where is_default;

-- A member's chosen theme in a community; null = the community default.
alter table public.community_memberships add column feed_theme_id uuid references public.feed_themes (id);

insert into public.feed_themes (slug, name, layout, animations)
values ('column', 'Classic', 'column', '{"enter": "fade", "answered": "glow"}');
insert into public.community_feed_themes (community_id, theme_id, is_default)
select public.default_community_id(), id, true from public.feed_themes where slug = 'column';

-- Verses a layout can place between posts (plain cards in a column, leaves on a vine).
create table public.scripture_leaves (
  id uuid primary key default public.uuid_v7(),
  community_id uuid not null references public.communities (id) on delete cascade,
  reference text not null check (char_length(reference) <= 80),
  text text not null check (char_length(text) <= 1000),
  translation text check (char_length(translation) <= 40),
  active boolean not null default true
);

alter table public.communities enable row level security;
alter table public.feed_themes enable row level security;
alter table public.community_feed_themes enable row level security;
alter table public.scripture_leaves enable row level security;
revoke all on public.feed_themes, public.community_feed_themes, public.scripture_leaves from anon, authenticated;
alter table public.community_domains enable row level security;
alter table public.community_memberships enable row level security;
revoke all on public.communities, public.community_domains, public.community_memberships from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
