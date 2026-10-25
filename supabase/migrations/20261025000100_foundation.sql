-- Foundation: IDs, accounts (profiles), roles, follows.
--
-- Access model: the API server is the only writer. Every public table has RLS
-- enabled with no policies, and anon/authenticated lose their default grants,
-- so the auto-generated Supabase Data API cannot read or write app data.

-- UUIDv7: time-sortable, random suffix. Postgres 17 has no built-in uuidv7().
create or replace function public.uuid_v7() returns uuid
language sql volatile parallel safe as $$
  select encode(
    set_bit(set_bit(
      overlay(uuid_send(gen_random_uuid())
        placing substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3)
        from 1 for 6),
      52, 1), 53, 1),
    'hex')::uuid;
$$;

-- Accounts --------------------------------------------------------------------

create type public.app_role as enum ('admin', 'moderator', 'pastor_counselor', 'prayer_partner');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  user_id uuid generated always as (id) stored,
  display_name text not null default '' check (char_length(display_name) <= 80),
  handle text unique check (handle ~ '^[a-z0-9_]{3,30}$'),
  bio text not null default '' check (char_length(bio) <= 500),
  -- "Why are you here": pray_for_others, prayer_for_myself, pray_without_ceasing, extend_reach
  why_here text[] not null default '{}',
  support_wanted text[] not null default '{}',
  support_offered text[] not null default '{}',
  -- family, friends, church, community, nation, world
  pray_for_scope text[] not null default '{}',
  trauma_content_opt_out boolean not null default false,
  anonymous_by_default boolean not null default false,
  updates_in_first_comment boolean not null default true,
  onboarded_at timestamptz,
  suspended_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.follows (
  user_id uuid not null references public.profiles (id) on delete cascade,      -- follower
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, followee_id),
  check (user_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id);

-- Every new Supabase Auth user gets a profile.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
