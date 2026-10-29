-- Offline replays (apps/server/src/modules/idempotency): a post or "Praying Now" the app queued
-- after a timeout may already have reached the server. The app sends one Idempotency-Key with the
-- first try and every replay, and the first answer is kept here so a replay never posts twice.
-- Rows are deleted after a week by the retention job.
create table public.request_keys (
  user_id uuid not null references public.profiles (id) on delete cascade,
  key text not null check (char_length(key) between 8 and 100),
  route text not null,
  -- null while the first request is still running.
  status smallint,
  body text,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);
create index request_keys_created_at on public.request_keys (created_at);
alter table public.request_keys enable row level security;
