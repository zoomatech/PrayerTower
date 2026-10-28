-- "Trained, personal pastors & counselors & prayer partners available to pray"
-- (notebook Page 4). A member asks; staff with the matching role see the
-- request in a queue, one claims it, and the two talk in a private care
-- conversation. Confession to clergy (Page 2) waits on legal review, so it is
-- off by default.

create type public.care_kind as enum ('pray_with_me', 'pastor', 'confession');
create type public.care_status as enum ('open', 'claimed', 'closed');

create table public.care_requests (
  id uuid primary key default public.uuid_v7(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  community_id uuid not null default public.default_community_id() references public.communities (id),
  kind public.care_kind not null,
  body text not null check (char_length(body) between 1 and 2000),
  status public.care_status not null default 'open',
  crisis boolean not null default false,
  claimed_by uuid references public.profiles (id) on delete set null,
  claimed_at timestamptz,
  conversation_id uuid references public.conversations (id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
create index care_requests_queue_idx on public.care_requests (status, crisis desc, id) where status = 'open';
create index care_requests_user_idx on public.care_requests (user_id, created_at desc);

create table public.care_settings (
  id boolean primary key default true check (id),
  care_enabled boolean not null default true,
  -- Needs a lawyer first (confidentiality, mandatory reporting). Off until Steve says so.
  confession_enabled boolean not null default false,
  max_open_per_member int not null default 2 check (max_open_per_member between 1 and 50)
);
insert into public.care_settings default values;

alter table public.care_requests enable row level security;
alter table public.care_settings enable row level security;
