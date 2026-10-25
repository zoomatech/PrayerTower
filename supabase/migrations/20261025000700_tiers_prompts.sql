-- Tier resupply bookkeeping, prayer prompts ("When was the last time you
-- prayed for ___?") with frequency caps.

create type public.prompt_response as enum ('prayed', 'dismissed', 'snoozed');

create table public.prayer_prompts (
  id uuid primary key default public.uuid_v7(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  commitment_id uuid references public.commitments (id) on delete set null,
  shown_at timestamptz not null default now(),
  response public.prompt_response,
  responded_at timestamptz
);
create index prayer_prompts_user_idx on public.prayer_prompts (user_id, shown_at desc);

alter table public.profiles
  -- Members can turn prompts off or space them out; null = app default.
  add column prompts_enabled boolean not null default true,
  add column prompt_min_hours smallint check (prompt_min_hours between 1 and 168);

alter table public.prayer_prompts enable row level security;
revoke all on public.prayer_prompts from anon, authenticated;
