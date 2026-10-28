-- Account deletion requests from the public web page (Google Play requires a
-- way to ask for deletion without the app). Staff check the request with the
-- member by email, then delete from the admin screen.
create table public.account_deletion_requests (
  id uuid primary key default public.uuid_v7(),
  email text not null check (char_length(email) between 3 and 320),
  note text check (char_length(note) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'deleted', 'dismissed')),
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index account_deletion_requests_pending on public.account_deletion_requests (created_at) where status = 'pending';
alter table public.account_deletion_requests enable row level security;
