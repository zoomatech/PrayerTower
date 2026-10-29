-- Push reliability (2026-10-29): a record of every push sent to each device, so a
-- retried job never sends the same notice twice; Expo's receipts are read back
-- about 15 minutes later (a dead device's token is turned off, "too many" is sent
-- again later); pushes about the same request close together are folded into
-- one, and a member gets at most a set number of everyday pushes an hour (the
-- notices always stay in the app). Off until Admin → Push delivery turns it on;
-- off, pushes go out as before.
-- https://docs.expo.dev/push-notifications/sending-notifications/
create table public.push_settings (
  id boolean primary key default true check (id),
  push_reliability_enabled boolean not null default false,
  -- A second push of the same kind about the same request within this many minutes is folded (0 = never).
  collapse_minutes int not null default 10 check (collapse_minutes between 0 and 1440),
  -- Everyday pushes per member per hour; safety and moderation notices are never capped.
  max_per_hour int not null default 8 check (max_per_hour between 1 and 100)
);
insert into public.push_settings default values;
alter table public.push_settings enable row level security;

create table public.push_deliveries (
  id bigint generated always as identity primary key,
  notification_id uuid not null references public.notifications (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null,
  -- sent: Expo took it (ticket); ok: the receipt says delivered to Apple/Google;
  -- error: refused for good; retry: waiting to be sent again; held: quiet hours;
  -- folded: a recent push said the same; capped: over the hourly limit.
  status text not null check (status in ('sent', 'ok', 'error', 'retry', 'held', 'folded', 'capped')),
  ticket_id text,
  error text,
  attempts int not null default 1,
  created_at timestamptz not null default now(),
  checked_at timestamptz,
  unique (notification_id, token)
);
create index push_deliveries_status_idx on public.push_deliveries (status, created_at);
create index push_deliveries_user_idx on public.push_deliveries (user_id, created_at desc);
alter table public.push_deliveries enable row level security;
