-- Weekly email digest: off unless the member turns it on.
alter table public.profiles
  add column digest_enabled boolean not null default false,
  add column digest_sent_week text;
