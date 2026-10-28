-- Penalties for using prayer requests as ads (Annotated Read, chat 10: "ban ads
-- and penalize people who use prayer requests as ads with actual fines").
-- Off by default. When an admin turns it on, a moderator's removal under the
-- "No ads" rule also:
--   * takes a set number of regular tokens (token forfeiture),
--   * records a fine of a set amount (fine_cents), which the member owes,
--   * suspends a repeat offender for longer each time.
-- Collecting the money is not built: there is no payment provider. A fine is
-- recorded, shown to the member, and an admin marks it paid or waives it.
-- An overturned appeal waives the fine and returns the tokens.
create table public.ad_fine_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  forfeit_tokens int not null default 10 check (forfeit_tokens between 0 and 10000),
  -- Placeholder until counsel sets an amount tied to the cost of review.
  fine_cents int not null default 0 check (fine_cents between 0 and 1000000),
  -- Suspension for a second offense; it doubles for each one after that, up to a year.
  repeat_suspend_days int not null default 7 check (repeat_suspend_days between 0 and 365),
  -- Offenses older than this don't count toward "repeat".
  lookback_days int not null default 365 check (lookback_days between 1 and 3650)
);
insert into public.ad_fine_settings default values;
alter table public.ad_fine_settings enable row level security;

create type public.ad_fine_status as enum ('owed', 'paid', 'waived');

create table public.ad_fines (
  id uuid primary key default public.uuid_v7(),
  moderation_item_id uuid not null unique references public.moderation_items (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  offense int not null check (offense >= 1),
  tokens_forfeited int not null default 0 check (tokens_forfeited >= 0),
  fine_cents int not null default 0 check (fine_cents >= 0),
  suspend_days int not null default 0 check (suspend_days >= 0),
  status public.ad_fine_status not null default 'owed',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index ad_fines_user on public.ad_fines (user_id, created_at desc);
create index ad_fines_status on public.ad_fines (status, created_at desc);
alter table public.ad_fines enable row level security;
