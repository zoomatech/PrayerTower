-- Two-step sign-in (Steve 2026-10-28: "Eventually we'll need 2 factor
-- authentication"). Supabase Auth's TOTP factors: the member adds an
-- authenticator app on Me → Password and email, and from then on enters its
-- 6-digit code after the password. Off by default: while off, nobody is offered
-- it. Members who already turned it on keep it, and the API still requires the
-- code from them (aal2), whatever the switch says.
create table public.security_settings (
  id boolean primary key default true check (id),
  two_step_enabled boolean not null default false
);
insert into public.security_settings default values;
alter table public.security_settings enable row level security;
