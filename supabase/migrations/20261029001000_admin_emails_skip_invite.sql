-- The first admin needs no invite code. On a fresh project there are no codes
-- and no admin to make one, so the addresses in ADMIN_EMAILS (copied here by
-- the API at start-up) may sign up without a code. They still have to confirm
-- the address before they become admin (accounts.bootstrapAdmins).
create table public.invite_exempt_emails (
  email text primary key check (email = lower(email))
);
alter table public.invite_exempt_emails enable row level security;

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
  if exists (select 1 from public.invite_exempt_emails e where e.email = lower(btrim(coalesce(event -> 'user' ->> 'email', '')))) then
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
