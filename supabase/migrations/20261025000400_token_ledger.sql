-- Append-only, double-entry token ledger.
--
-- Every movement is one row in token_transfers that debits one account and
-- credits another. Rows are never updated or deleted; corrections are new
-- transfers (a clawback reverses an earlier transfer). Account balances are a
-- cache maintained only by post_token_transfer(), guarded by a no-negative
-- check, and can always be re-derived from the transfers (see
-- token_ledger_audit). Only the API server's database role may call it.

create type public.token_account_kind as enum (
  'user',        -- a member's spendable balance
  'post_reach',  -- tokens spent to extend one request's reach
  'mint',        -- system source for earned tokens and resupply (may go negative)
  'forfeit'      -- system sink for moderation forfeits
);

create type public.token_transfer_kind as enum ('earn', 'gift', 'spend_reach', 'resupply', 'forfeit', 'clawback');

create table public.token_accounts (
  id uuid primary key default public.uuid_v7(),
  kind public.token_account_kind not null,
  user_id uuid references public.profiles (id) on delete restrict,
  post_id uuid references public.posts (id) on delete restrict,
  balance bigint not null default 0,
  created_at timestamptz not null default now(),
  check ((kind = 'user') = (user_id is not null)),
  check ((kind = 'post_reach') = (post_id is not null)),
  check (kind = 'mint' or balance >= 0)
);
create unique index token_accounts_user_uq on public.token_accounts (user_id) where kind = 'user';
create unique index token_accounts_post_uq on public.token_accounts (post_id) where kind = 'post_reach';
create unique index token_accounts_system_uq on public.token_accounts (kind) where kind in ('mint', 'forfeit');

insert into public.token_accounts (kind) values ('mint'), ('forfeit');

create table public.token_transfers (
  id uuid primary key default public.uuid_v7(),
  idempotency_key text not null unique check (char_length(idempotency_key) between 1 and 200),
  kind public.token_transfer_kind not null,
  debit_account_id uuid not null references public.token_accounts (id),
  credit_account_id uuid not null references public.token_accounts (id),
  amount bigint not null check (amount > 0),
  reverses_transfer_id uuid unique references public.token_transfers (id),
  actor_id uuid references public.profiles (id),
  reason text check (char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  check (debit_account_id <> credit_account_id),
  check ((kind = 'clawback') = (reverses_transfer_id is not null))
);
create index token_transfers_debit_idx on public.token_transfers (debit_account_id, created_at);
create index token_transfers_credit_idx on public.token_transfers (credit_account_id, created_at);

create or replace function public.token_transfers_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'token_transfers is append-only' using errcode = 'P0001';
end;
$$;

create trigger token_transfers_no_update before update or delete on public.token_transfers
  for each row execute function public.token_transfers_immutable();
create trigger token_transfers_no_truncate before truncate on public.token_transfers
  for each statement execute function public.token_transfers_immutable();

-- Get or create a member's account.
create or replace function public.token_user_account(p_user_id uuid) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from public.token_accounts where kind = 'user' and user_id = p_user_id;
  if v_id is null then
    insert into public.token_accounts (kind, user_id) values ('user', p_user_id)
    on conflict (user_id) where kind = 'user' do nothing;
    select id into v_id from public.token_accounts where kind = 'user' and user_id = p_user_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.token_post_reach_account(p_post_id uuid) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from public.token_accounts where kind = 'post_reach' and post_id = p_post_id;
  if v_id is null then
    insert into public.token_accounts (kind, post_id) values ('post_reach', p_post_id)
    on conflict (post_id) where kind = 'post_reach' do nothing;
    select id into v_id from public.token_accounts where kind = 'post_reach' and post_id = p_post_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.token_system_account(p_kind public.token_account_kind) returns uuid
language sql stable as $$
  select id from public.token_accounts where kind = p_kind;
$$;

-- The single write path. Idempotent: a repeated key returns the original
-- transfer (and raises if the repeat asks for something different).
-- Insufficient funds raise SQLSTATE 23514 (check_violation) from the
-- no-negative constraint.
create or replace function public.post_token_transfer(
  p_idempotency_key text,
  p_kind public.token_transfer_kind,
  p_debit_account_id uuid,
  p_credit_account_id uuid,
  p_amount bigint,
  p_actor_id uuid default null,
  p_reason text default null,
  p_reverses_transfer_id uuid default null
) returns public.token_transfers
language plpgsql as $$
declare
  v_existing public.token_transfers;
  v_new public.token_transfers;
begin
  -- Lock both accounts in a fixed order so concurrent transfers cannot deadlock
  -- and a repeated key waits for the first attempt to commit.
  perform 1 from public.token_accounts
    where id in (p_debit_account_id, p_credit_account_id)
    order by id
    for update;

  select * into v_existing from public.token_transfers where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.kind <> p_kind or v_existing.debit_account_id <> p_debit_account_id
       or v_existing.credit_account_id <> p_credit_account_id or v_existing.amount <> p_amount then
      raise exception 'idempotency key % reused with different parameters', p_idempotency_key
        using errcode = 'P0002';
    end if;
    return v_existing;
  end if;

  update public.token_accounts set balance = balance - p_amount where id = p_debit_account_id;
  update public.token_accounts set balance = balance + p_amount where id = p_credit_account_id;

  insert into public.token_transfers
    (idempotency_key, kind, debit_account_id, credit_account_id, amount, actor_id, reason, reverses_transfer_id)
  values
    (p_idempotency_key, p_kind, p_debit_account_id, p_credit_account_id, p_amount, p_actor_id, p_reason, p_reverses_transfer_id)
  returning * into v_new;
  return v_new;
end;
$$;

-- Reverse an earlier transfer in full. Each transfer can be clawed back once.
create or replace function public.clawback_token_transfer(
  p_transfer_id uuid,
  p_actor_id uuid,
  p_reason text
) returns public.token_transfers
language plpgsql as $$
declare v_orig public.token_transfers;
begin
  select * into v_orig from public.token_transfers where id = p_transfer_id;
  if not found then
    raise exception 'transfer % not found', p_transfer_id using errcode = 'P0003';
  end if;
  if v_orig.kind = 'clawback' then
    raise exception 'a clawback cannot be clawed back' using errcode = 'P0004';
  end if;
  return public.post_token_transfer(
    'clawback:' || p_transfer_id::text, 'clawback',
    v_orig.credit_account_id, v_orig.debit_account_id, v_orig.amount,
    p_actor_id, p_reason, p_transfer_id);
end;
$$;

-- Rows where the cached balance disagrees with the transfers. Must be empty.
create view public.token_ledger_audit as
  select a.id, a.kind, a.balance,
         coalesce(c.total, 0) - coalesce(d.total, 0) as derived_balance
  from public.token_accounts a
  left join (select credit_account_id id, sum(amount) total from public.token_transfers group by 1) c on c.id = a.id
  left join (select debit_account_id id, sum(amount) total from public.token_transfers group by 1) d on d.id = a.id
  where a.balance <> coalesce(c.total, 0) - coalesce(d.total, 0);

-- Tier ladder and weekly resupply. Thresholds and allotments are not decided
-- yet, so rows ship with nulls; the app treats null as "not configured".
create table public.tier_settings (
  tier text primary key,
  rank smallint not null unique,
  min_prayer_events int,
  weekly_allotment int check (weekly_allotment >= 0),
  label text not null
);
insert into public.tier_settings (tier, rank, label) values
  ('prayer_scout', 1, 'Prayer Scout'),
  ('prayerful_helper', 2, 'Prayerful Helper'),
  ('prayer_warrior', 3, 'Prayer Warrior');
