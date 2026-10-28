-- Invite-only pilot: while invite_only is on (the default), Supabase Auth only
-- creates an account when the sign-up carries a valid invite code in its user
-- metadata (invite_code). Admins create and revoke codes in Admin → Invites.
-- The check runs in Supabase Auth's "before user created" hook, so it holds
-- for every client, not only the app.
-- https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook

create table public.invite_settings (
  id boolean primary key default true check (id),
  invite_only boolean not null default true
);
insert into public.invite_settings default values;
alter table public.invite_settings enable row level security;

create table public.invite_codes (
  code text primary key check (code ~ '^[A-Z0-9]{6,16}$'),
  created_by uuid references public.profiles (id) on delete set null,
  -- Who it's for, so admins can tell codes apart ("Grace Church small group").
  note text not null default '' check (char_length(note) <= 200),
  max_uses int not null default 1 check (max_uses between 1 and 1000),
  uses int not null default 0 check (uses >= 0),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index invite_codes_recent_idx on public.invite_codes (created_at desc);
alter table public.invite_codes enable row level security;

create table public.invite_redemptions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  code text not null references public.invite_codes (code),
  redeemed_at timestamptz not null default now()
);
create index invite_redemptions_code_idx on public.invite_redemptions (code);
alter table public.invite_redemptions enable row level security;

-- Accounts that staff create with the secret key (seed, review account) don't
-- go through this hook; they also set app_metadata.invite_exempt, which members
-- can't set themselves, in case a future Auth version runs it for them too.
-- Security definer, so the tables keep RLS with no policies (as every public
-- table here does); only supabase_auth_admin may call it.
create or replace function public.hook_before_user_created(event jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := upper(btrim(coalesce(event -> 'user' -> 'user_metadata' ->> 'invite_code', '')));
  used int;
begin
  if not (select invite_only from public.invite_settings) then
    return '{}'::jsonb;
  end if;
  if coalesce(event -> 'user' -> 'app_metadata' ->> 'invite_exempt', '') = 'true' then
    return '{}'::jsonb;
  end if;
  if v_code = '' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403,
      'message', 'Prayer Tower is invite-only right now. Enter your invite code.'));
  end if;
  update public.invite_codes c set uses = c.uses + 1
   where c.code = v_code
     and c.revoked_at is null
     and (c.expires_at is null or c.expires_at > now())
     and c.uses < c.max_uses
  returning c.uses into used;
  if used is null then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403,
      'message', 'That invite code is not valid. Check it, or ask for a new one.'));
  end if;
  return '{}'::jsonb;
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from authenticated, anon, public;

-- Remember which code each member used (the hook runs before the user row exists).
create or replace function public.record_invite_redemption() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := upper(btrim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
begin
  if v_code <> '' and exists (select 1 from public.invite_codes c where c.code = v_code) then
    insert into public.invite_redemptions (user_id, code) values (new.id, v_code) on conflict do nothing;
  end if;
  return new;
end;
$$;

-- Named to sort after on_auth_user_created, which makes the profile first.
revoke execute on function public.record_invite_redemption() from authenticated, anon, public;

create trigger on_auth_user_created_invite
  after insert on auth.users
  for each row execute function public.record_invite_redemption();
