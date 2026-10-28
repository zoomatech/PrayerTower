-- Background jobs that ran out of tries and were already reported to admins,
-- so each one alerts once (modules/jobs). The jobs themselves stay in Graphile
-- Worker's queue until an admin retries or discards them.
create table public.job_alerts (
  job_id bigint primary key,
  task text not null,
  alerted_at timestamptz not null default now()
);
alter table public.job_alerts enable row level security;
