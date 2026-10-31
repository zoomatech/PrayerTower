-- Prayer resolution check-ins (Steve, 2026-10-31): some days after a prayer request, its
-- author is asked "Has this prayer been answered?".
--   * Yes: a brief survey with two answers, "The Lord answered my prayer in a way I had
--     hoped" or "...according to his will, not my will". The request is marked answered.
--   * Not yet: they may repost the request or reword it, and may be offered a free
--     broadcast (Priestly) token.
--   * Whether an answered request went out by radio is looked up in radio_prayers, never
--     asked.
-- Admin → Prayer resolution sets the timing. On by default (Steve ordered it).

create table public.resolution_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  -- Days after the request is posted before the first check-in.
  first_days int not null default 14 check (first_days between 1 and 365),
  -- Days before asking again after "not yet" (or no answer).
  again_days int not null default 30 check (again_days between 1 and 365),
  -- Most check-ins on one request.
  max_asks int not null default 3 check (max_asks between 1 and 12),
  -- Free broadcast (Priestly) tokens offered after "not yet"; 0 = no offer.
  free_tokens int not null default 1 check (free_tokens between 0 and 100),
  -- A member gets the free token at most once in this many days (0 = no limit).
  free_token_every_days int not null default 30 check (free_token_every_days between 0 and 365)
);
insert into public.resolution_settings (id) values (true);

create type public.resolution_outcome as enum ('hoped', 'his_will');

create table public.prayer_resolutions (
  post_id uuid primary key references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  asks int not null default 0,
  -- An ask is waiting for an answer.
  pending boolean not null default false,
  asked_at timestamptz,
  next_ask_at timestamptz,
  -- null: never answered; false: "not yet"; true: answered.
  answered boolean,
  outcome public.resolution_outcome,
  answered_at timestamptz,
  not_yet_at timestamptz,
  -- Looked up from radio_prayers when the author says it was answered.
  prayercast boolean,
  prayercast_count int,
  prayercast_at timestamptz,
  -- After "not yet": the new request it was reposted (or reworded) as.
  reposted_post_id uuid references public.posts (id) on delete set null,
  token_transfer_id uuid references public.token_transfers (id),
  created_at timestamptz not null default now()
);
create index prayer_resolutions_user_idx on public.prayer_resolutions (user_id);
create index prayer_resolutions_due_idx on public.prayer_resolutions (next_ask_at) where answered is not true and reposted_post_id is null;
create index prayer_resolutions_reposted_idx on public.prayer_resolutions (reposted_post_id) where reposted_post_id is not null;

alter table public.prayer_resolutions enable row level security;
alter table public.resolution_settings enable row level security;
revoke all on public.prayer_resolutions, public.resolution_settings from anon, authenticated;
