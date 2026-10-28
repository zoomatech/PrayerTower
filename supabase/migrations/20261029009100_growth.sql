-- Growth ideas the big platforms missed (roadmap/Growth_Ideas_Big_Platforms_Missed.md,
-- Steve 2026-10-28: "a way to boost usage that the other Social Media companies
-- missed"). Every switch is off by default; Admin → Growth turns them on.
--   1. Guest prayer: a member makes a link for their own request; anyone can
--      open it on the web and tap "I prayed" without an account.
--   2. Prayer chain: a member's existing email prayer chain (each address
--      confirms first) gets their requests with the same one-tap link.
--   3. Prayed-for widget: the home-screen widget also says who prayed for you today.
--   4. Prayer minute: each member may pick one minute a day to pray alongside
--      everyone else who chose it.
create table public.growth_settings (
  id boolean primary key default true check (id),
  guest_prayer_enabled boolean not null default false,
  prayer_chain_enabled boolean not null default false,
  prayer_chain_max int not null default 50 check (prayer_chain_max between 1 and 500),
  prayed_for_widget_enabled boolean not null default false,
  prayer_minute_enabled boolean not null default false,
  -- Guest email addresses are erased after the answered note goes out, or after this many days.
  guest_email_days int not null default 90 check (guest_email_days between 1 and 365)
);
insert into public.growth_settings default values;
alter table public.growth_settings enable row level security;

-- 1. Guest prayer -------------------------------------------------------------------
create table public.guest_links (
  id uuid primary key default public.uuid_v7(),
  post_id uuid not null unique references public.posts (id) on delete cascade,
  token text not null unique check (length(token) >= 20),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.guest_links enable row level security;

create table public.guest_prayers (
  id uuid primary key default public.uuid_v7(),
  link_id uuid not null references public.guest_links (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  first_name text check (length(first_name) between 1 and 40),
  email text check (length(email) between 3 and 254),
  -- A keyed hash of the address, never the address itself: one prayer per network per link per day.
  ip_hash text not null,
  day date not null default (now() at time zone 'utc')::date,
  answered_sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (link_id, ip_hash, day)
);
create index guest_prayers_post on public.guest_prayers (post_id, created_at);
create index guest_prayers_email on public.guest_prayers (created_at) where email is not null;
alter table public.guest_prayers enable row level security;

-- 2. Prayer chain -------------------------------------------------------------------
create type public.prayer_chain_status as enum ('pending', 'confirmed', 'left');

create table public.prayer_chain_members (
  id uuid primary key default public.uuid_v7(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  email text not null check (email = lower(email) and length(email) between 3 and 254),
  status public.prayer_chain_status not null default 'pending',
  token text not null unique check (length(token) >= 20),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (owner_id, email)
);
alter table public.prayer_chain_members enable row level security;

-- One send per request, so a request never goes to the chain twice.
create table public.prayer_chain_sends (
  post_id uuid primary key references public.posts (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.prayer_chain_sends enable row level security;

-- 4. Prayer minute ------------------------------------------------------------------
create table public.prayer_minutes (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  minute_of_day smallint not null check (minute_of_day between 0 and 1439),
  time_zone text not null check (length(time_zone) between 1 and 64),
  created_at timestamptz not null default now()
);
alter table public.prayer_minutes enable row level security;

-- Who has the prayer-minute screen open: the live count is real, from these rows.
create table public.prayer_minute_presence (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  seen_at timestamptz not null default now()
);
create index prayer_minute_presence_seen on public.prayer_minute_presence (seen_at);
alter table public.prayer_minute_presence enable row level security;
