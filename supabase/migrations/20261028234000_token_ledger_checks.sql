-- Nightly token ledger integrity check (worker task token_ledger_check). Each
-- run is recorded here; any mismatch alerts every admin. Admin → Tokens shows
-- the latest run and can run one now.
create table public.token_ledger_checks (
  id uuid primary key default public.uuid_v7(),
  checked_at timestamptz not null default now(),
  ok boolean not null,
  accounts_checked int not null,
  transfers_checked bigint not null,
  -- [{ check, accountId?, currency?, kind?, balance?, derived?, total? }]
  problems jsonb not null default '[]'::jsonb,
  -- The admin who ran it by hand; null for the nightly run.
  triggered_by uuid references public.profiles (id) on delete set null
);
create index token_ledger_checks_recent_idx on public.token_ledger_checks (checked_at desc);
alter table public.token_ledger_checks enable row level security;
