-- Two token currencies on the one ledger.
--
-- Regular tokens: 1 per prayer (Praying Now, once per post per day) and 1 per
-- commitment check-in. Priestly tokens: every N verified prayers earn 1. A
-- verified prayer is one for someone else's request, at least
-- verified_prayer_min_gap_seconds after the member's previous prayer, so a
-- burst of taps does not count. Priestly tokens can be gifted or donated to
-- the infrastructure fund. A transfer never mixes currencies.

alter table public.token_accounts add column currency public.token_currency not null default 'regular';

drop index public.token_accounts_user_uq;
drop index public.token_accounts_system_uq;
create unique index token_accounts_user_uq on public.token_accounts (user_id, currency) where kind = 'user';
create unique index token_accounts_system_uq on public.token_accounts (kind, currency)
  where kind in ('mint', 'forfeit', 'infrastructure');
alter table public.token_accounts add constraint token_accounts_post_reach_regular
  check (kind <> 'post_reach' or currency = 'regular');

insert into public.token_accounts (kind, currency) values
  ('mint', 'priestly'), ('forfeit', 'priestly'), ('infrastructure', 'priestly');

drop function public.token_user_account(uuid);
create function public.token_user_account(p_user_id uuid, p_currency public.token_currency default 'regular')
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from public.token_accounts
   where kind = 'user' and user_id = p_user_id and currency = p_currency;
  if v_id is null then
    insert into public.token_accounts (kind, user_id, currency) values ('user', p_user_id, p_currency)
    on conflict (user_id, currency) where kind = 'user' do nothing;
    select id into v_id from public.token_accounts
     where kind = 'user' and user_id = p_user_id and currency = p_currency;
  end if;
  return v_id;
end;
$$;

drop function public.token_system_account(public.token_account_kind);
create function public.token_system_account(p_kind public.token_account_kind, p_currency public.token_currency default 'regular')
returns uuid language sql stable as $$
  select id from public.token_accounts where kind = p_kind and currency = p_currency;
$$;

create or replace function public.token_transfers_same_currency() returns trigger
language plpgsql as $$
begin
  if (select count(distinct currency) from public.token_accounts
       where id in (new.debit_account_id, new.credit_account_id)) <> 1 then
    raise exception 'a transfer cannot mix token currencies' using errcode = 'P0005';
  end if;
  return new;
end;
$$;
create trigger token_transfers_same_currency before insert on public.token_transfers
  for each row execute function public.token_transfers_same_currency();

-- Admin-tunable token rules (one row).
create table public.token_settings (
  id boolean primary key default true check (id),
  priestly_prayers_per_token int not null default 10 check (priestly_prayers_per_token > 0),
  verified_prayer_min_gap_seconds int not null default 60 check (verified_prayer_min_gap_seconds >= 0),
  updated_at timestamptz not null default now()
);
insert into public.token_settings default values;
create trigger token_settings_touch before update on public.token_settings
  for each row execute function public.touch_updated_at();

-- Verified prayers toward the next Priestly token.
create table public.priestly_progress (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  verified_pending int not null default 0 check (verified_pending >= 0),
  verified_total int not null default 0 check (verified_total >= 0)
);

alter table public.prayer_events
  add column verified boolean not null default false,
  add column priestly_counted boolean not null default false;

-- Decide at insert whether a prayer is verified.
create or replace function public.prayer_events_verify() returns trigger
language plpgsql as $$
declare
  v_gap int;
  v_last timestamptz;
begin
  select verified_prayer_min_gap_seconds into v_gap from public.token_settings;
  select max(created_at) into v_last from public.prayer_events where user_id = new.user_id;
  new.verified := (select p.user_id <> new.user_id from public.posts p where p.id = new.post_id)
    and (v_last is null or new.created_at - v_last >= make_interval(secs => coalesce(v_gap, 0)));
  return new;
end;
$$;
create trigger prayer_events_verify before insert on public.prayer_events
  for each row execute function public.prayer_events_verify();

-- Count one verified prayer toward Priestly tokens and credit a token when the
-- member reaches the rate. Safe to call more than once for the same event.
create or replace function public.credit_priestly_progress(p_event_id uuid)
returns int language plpgsql as $$
declare
  v_user uuid;
  v_rate int;
  v_pending int;
  v_total int;
  v_earned int := 0;
begin
  update public.prayer_events set priestly_counted = true
   where id = p_event_id and verified and not priestly_counted
  returning user_id into v_user;
  if v_user is null then return 0; end if;

  select priestly_prayers_per_token into v_rate from public.token_settings;
  insert into public.priestly_progress (user_id, verified_pending, verified_total) values (v_user, 1, 1)
  on conflict (user_id) do update
    set verified_pending = priestly_progress.verified_pending + 1,
        verified_total = priestly_progress.verified_total + 1
  returning verified_pending, verified_total into v_pending, v_total;

  while v_pending >= v_rate loop
    v_pending := v_pending - v_rate;
    v_earned := v_earned + 1;
  end loop;
  if v_earned > 0 then
    update public.priestly_progress set verified_pending = v_pending where user_id = v_user;
    perform public.post_token_transfer(
      'earn:priestly:' || v_user::text || ':' || v_total::text, 'earn',
      public.token_system_account('mint', 'priestly'), public.token_user_account(v_user, 'priestly'),
      v_earned, null, 'Verified prayers');
  end if;
  return v_earned;
end;
$$;

alter table public.token_settings enable row level security;
alter table public.priestly_progress enable row level security;
revoke all on public.token_settings, public.priestly_progress from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
