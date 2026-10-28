-- Cross-posting (Steve, 2026-10-28): a member who posts on Facebook or Threads
-- gets the same post (text and photos) on their own Prayer Tower account
-- automatically. Off by default (notebook_settings.crosspost_enabled). Three ways in:
--   * the browser extension (apps/extension) copies the post the moment Post is clicked;
--   * a connected Threads account (Threads API, threads_basic; publish webhook and polling);
--   * a connected Facebook account (Graph API user_posts, polled; needs Meta App Review).
-- See docs/CROSSPOST.md.
alter table public.notebook_settings add column crosspost_enabled boolean not null default false;

alter table public.communities drop constraint communities_hidden_features_check;
alter table public.communities add constraint communities_hidden_features_check
  check (hidden_features <@ array['radio', 'spoken', 'care', 'events', 'groups', 'awards', 'live', 'circles', 'pools', 'highlights', 'surveys', 'podcasts', 'crosspost']);

-- A member's choices, and the hash of their extension key (the key itself is shown once).
create table public.crosspost_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- The kind of post copies become (null: discussion where the community has it, else testimony).
  post_type public.post_type,
  paused boolean not null default false,
  extension_key_hash text unique,
  -- The key's last four characters, so the member can tell which key is in use.
  extension_key_hint text,
  updated_at timestamptz not null default now()
);
alter table public.crosspost_settings enable row level security;

-- Connected Facebook or Threads accounts. Tokens are encrypted by the server (CROSSPOST_TOKEN_KEY).
create table public.crosspost_accounts (
  id uuid primary key default public.uuid_v7(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('threads', 'facebook')),
  external_user_id text not null,
  username text,
  access_token text not null,
  token_expires_at timestamptz,
  token_refreshed_at timestamptz not null default now(),
  -- Only posts made after connecting are copied.
  import_since timestamptz not null default now(),
  last_checked_at timestamptz,
  status text not null default 'active' check (status in ('active', 'expired')),
  created_at timestamptz not null default now(),
  unique (user_id, provider),
  unique (provider, external_user_id)
);
create index crosspost_accounts_due on public.crosspost_accounts (last_checked_at nulls first) where status = 'active';
alter table public.crosspost_accounts enable row level security;

-- One-time values for the Connect sign-in (protects against forged callbacks); kept one hour.
create table public.crosspost_oauth_states (
  state text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('threads', 'facebook')),
  created_at timestamptz not null default now()
);
alter table public.crosspost_oauth_states enable row level security;

-- Every post brought in (or skipped), so nothing is copied twice.
create table public.crosspost_imports (
  id uuid primary key default public.uuid_v7(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source text not null check (source in ('threads', 'facebook')),
  via text not null check (via in ('extension', 'account')),
  external_id text not null,
  -- sha256 of the text with spaces collapsed: the extension and a connected account
  -- can both see the same post, so the second copy is skipped.
  body_hash text not null,
  permalink text check (permalink is null or permalink ~ '^https://'),
  post_id uuid references public.posts (id) on delete set null,
  status text not null check (status in ('posted', 'skipped')),
  reason text,
  created_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);
create index crosspost_imports_recent on public.crosspost_imports (user_id, body_hash, created_at desc);
create index crosspost_imports_post on public.crosspost_imports (post_id) where post_id is not null;
alter table public.crosspost_imports enable row level security;
