-- Every change a staff member makes (Admin, moderation, witness team, pastors'
-- care queue, macro needs), recorded by the API after the request succeeds.
-- Read in Admin → Audit log. Append-only: the API only inserts.
create table public.staff_audit_log (
  id uuid primary key default public.uuid_v7(),
  -- Kept when the staff member's account is deleted (their profile stays as a tombstone).
  actor_id uuid references public.profiles (id) on delete set null,
  -- The route that ran, e.g. 'PUT /admin/people/:id/roles/:role'.
  action text not null check (char_length(action) <= 200),
  -- The main record acted on (the route's :id), when there is one.
  target_id uuid,
  params jsonb not null default '{}',
  -- The request body, except where it holds pastoral notes (left out).
  body jsonb,
  status smallint not null,
  created_at timestamptz not null default now()
);
create index staff_audit_log_recent_idx on public.staff_audit_log (created_at desc);
create index staff_audit_log_actor_idx on public.staff_audit_log (actor_id, created_at desc);
create index staff_audit_log_target_idx on public.staff_audit_log (target_id) where target_id is not null;
alter table public.staff_audit_log enable row level security;
