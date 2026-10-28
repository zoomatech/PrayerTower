-- In-app feedback for the pilot (launch checklist: "set up a feedback channel").
-- Members send bugs, ideas or anything else; admins read and close them.
create table public.feedback (
  id uuid primary key default public.uuid_v7(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'other' check (kind in ('bug', 'idea', 'other')),
  body text not null check (char_length(body) between 1 and 2000),
  platform text check (char_length(platform) <= 20),
  app_version text check (char_length(app_version) <= 40),
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_by uuid references public.profiles (id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
create index feedback_open on public.feedback (created_at) where status = 'open';
create index feedback_user on public.feedback (user_id);
alter table public.feedback enable row level security;
