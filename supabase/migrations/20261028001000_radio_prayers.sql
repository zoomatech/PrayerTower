-- Radio prayers: a member spends Priestly tokens to send a request out over
-- the intercessory radio infrastructure. The spend and the queue row are one
-- transaction; a worker job transmits and records the outcome. The tokens go
-- to the infrastructure fund, like a donation.

alter table public.token_settings
  add column radio_prayer_cost int not null default 1 check (radio_prayer_cost > 0);

create type public.radio_prayer_status as enum ('queued', 'transmitted', 'failed');

create table public.radio_prayers (
  id uuid primary key default public.uuid_v7(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  community_id uuid not null references public.communities (id), -- copied from the post
  transfer_id uuid not null unique references public.token_transfers (id),
  cost int not null check (cost > 0),
  status public.radio_prayer_status not null default 'queued',
  transmitter text,
  error text,
  created_at timestamptz not null default now(),
  transmitted_at timestamptz
);
create index radio_prayers_user_idx on public.radio_prayers (user_id, created_at desc);
create index radio_prayers_queued_idx on public.radio_prayers (created_at) where status = 'queued';

create trigger radio_prayers_community before insert on public.radio_prayers
  for each row execute function public.copy_post_community();

alter table public.radio_prayers enable row level security;
revoke all on public.radio_prayers from anon, authenticated;
