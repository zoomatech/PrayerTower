-- Two-step sign-in, part 2 (2026-10-29). Two more switches in Admin → Sign-in
-- security, both off:
-- - Backup codes: ten one-time codes a member saves when they turn on two-step
--   sign-in. If they lose their phone, one code turns two-step sign-in off so they
--   can sign in with their password and set it up again. Codes are stored hashed.
-- - Passkeys (Supabase Auth): sign in with Face ID, Touch ID or a security key.
alter table public.security_settings
  add column backup_codes_enabled boolean not null default false,
  add column passkeys_enabled boolean not null default false;

create table public.two_step_backup_codes (
  id uuid primary key default public.uuid_v7(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- scrypt of the normalized code, salted with this row's id.
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index two_step_backup_codes_user_idx on public.two_step_backup_codes (user_id) where used_at is null;
alter table public.two_step_backup_codes enable row level security;

-- Wrong codes, to slow down guessing (5 an hour).
create table public.two_step_backup_attempts (
  id uuid primary key default public.uuid_v7(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index two_step_backup_attempts_user_idx on public.two_step_backup_attempts (user_id, created_at);
alter table public.two_step_backup_attempts enable row level security;
