-- Donated token pools (roadmap Phase 2): a donor puts tokens in a pool, and
-- other members draw a fixed amount from it to extend a request's reach.
-- Advertising is banned, so a pool carries no links and the donor is
-- anonymous unless they choose to be named. Every limit is a placeholder.

create table public.token_pools (
  id uuid primary key default public.uuid_v7(),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 60),
  purpose text not null default '' check (char_length(purpose) <= 280),
  -- Optional: only requests in this realm may draw from it.
  realm text,
  draw_amount int not null default 5 check (draw_amount between 1 and 1000),
  draws_per_member_day int not null default 1 check (draws_per_member_day between 1 and 100),
  show_donor boolean not null default false,
  closed_at timestamptz,
  closed_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index token_pools_open_idx on public.token_pools (created_at desc) where closed_at is null;
create index token_pools_owner_idx on public.token_pools (owner_id, created_at desc);

alter table public.token_accounts add column pool_id uuid references public.token_pools (id) on delete restrict;
alter table public.token_accounts add constraint token_accounts_pool_ck check ((kind = 'pool') = (pool_id is not null));
alter table public.token_accounts add constraint token_accounts_pool_regular_ck check (kind <> 'pool' or currency = 'regular');
create unique index token_accounts_pool_uq on public.token_accounts (pool_id) where kind = 'pool';

create function public.token_pool_account(p_pool_id uuid) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from public.token_accounts where kind = 'pool' and pool_id = p_pool_id;
  if v_id is null then
    insert into public.token_accounts (kind, pool_id) values ('pool', p_pool_id)
    on conflict (pool_id) where kind = 'pool' do nothing;
    select id into v_id from public.token_accounts where kind = 'pool' and pool_id = p_pool_id;
  end if;
  return v_id;
end;
$$;

-- One draw per member per request per pool.
create table public.token_pool_draws (
  id uuid primary key default public.uuid_v7(),
  pool_id uuid not null references public.token_pools (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  transfer_id uuid not null unique references public.token_transfers (id),
  created_at timestamptz not null default now(),
  unique (pool_id, user_id, post_id)
);
create index token_pool_draws_user_idx on public.token_pool_draws (pool_id, user_id, created_at desc);

alter table public.token_pools enable row level security;
alter table public.token_pool_draws enable row level security;
