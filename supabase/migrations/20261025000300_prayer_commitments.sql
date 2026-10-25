-- Prayer events (Praying Now taps and commitment check-ins) and commitments.

create type public.commitment_frequency as enum ('weekly', 'daily', 'three_daily');
create type public.commitment_status as enum ('active', 'completed', 'cancelled');

create table public.commitments (
  id uuid primary key default public.uuid_v7(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  frequency public.commitment_frequency not null,
  vow_text text not null check (char_length(vow_text) <= 500),
  is_anonymous boolean not null default false,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  status public.commitment_status not null default 'active',
  next_reminder_at timestamptz,
  -- committed = prayers owed so far (reminders that came due); completed = check-ins.
  committed_count int not null default 0 check (committed_count >= 0),
  completed_count int not null default 0 check (completed_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index commitments_due_idx on public.commitments (next_reminder_at) where status = 'active';
create index commitments_user_idx on public.commitments (user_id, status);
create unique index commitments_one_active_per_post on public.commitments (user_id, post_id) where status = 'active';

create trigger commitments_touch before update on public.commitments
  for each row execute function public.touch_updated_at();

create type public.prayer_event_kind as enum ('praying_now', 'commitment_checkin');

create table public.prayer_events (
  id uuid primary key default public.uuid_v7(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.prayer_event_kind not null,
  commitment_id uuid references public.commitments (id) on delete set null,
  duration_seconds int check (duration_seconds between 0 and 86400),
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  check ((kind = 'commitment_checkin') = (commitment_id is not null))
);
create index prayer_events_post_idx on public.prayer_events (post_id, created_at desc);
create index prayer_events_user_idx on public.prayer_events (user_id, created_at desc);
