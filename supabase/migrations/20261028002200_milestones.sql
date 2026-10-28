-- Milestone bonus tokens. Steve said bonuses will be worked out later
-- (2026-10-27), so this is only the engine: admins define rules, and every
-- seeded rule is a disabled placeholder until Steve sets real ones.

create table public.milestone_rules (
  id uuid primary key default public.uuid_v7(),
  label text not null check (char_length(label) between 1 and 80),
  metric text not null check (metric in ('prayers_for_others', 'commitment_checkins', 'answered_requests')),
  threshold int not null check (threshold between 1 and 1000000),
  amount int not null check (amount between 1 and 100000),
  currency public.token_currency not null default 'regular',
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  unique (metric, threshold, currency)
);

create table public.milestone_awards (
  rule_id uuid not null references public.milestone_rules (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete cascade,
  transfer_id uuid not null unique references public.token_transfers (id),
  created_at timestamptz not null default now(),
  primary key (rule_id, user_id)
);

insert into public.milestone_rules (label, metric, threshold, amount) values
  ('First prayer for someone else (placeholder)', 'prayers_for_others', 1, 1),
  ('100 prayers for others (placeholder)', 'prayers_for_others', 100, 10),
  ('30 commitment check-ins (placeholder)', 'commitment_checkins', 30, 5);

alter table public.milestone_rules enable row level security;
alter table public.milestone_awards enable row level security;
