-- Notebook ideas built in Batch 7, each behind its own switch (all on by
-- default; an admin turns them off on the Admin screen):
--   * worldwide count: "N prayers offered worldwide today" and "N people have
--     prayed for you" (Project Management Document 2, the anonymous global count);
--   * thanksgiving card in the feed (Notes Page 14: "Add thanksgiving reminders to feed?");
--   * sermon and meeting inputs on events (Notes Page 12: "Eventually, sermon inputs?");
--   * "Prayer and positive thoughts welcome" label on posts (note of 2026-09-19:
--     secular-participation-friendly reactions and interactions).
create table public.notebook_settings (
  id boolean primary key default true check (id),
  worldwide_count_enabled boolean not null default true,
  thanks_card_enabled boolean not null default true,
  thanks_card_days int not null default 7 check (thanks_card_days between 1 and 60),
  sermon_inputs_enabled boolean not null default true,
  support_label_enabled boolean not null default true
);
insert into public.notebook_settings default values;
alter table public.notebook_settings enable row level security;

alter table public.posts add column all_support_welcome boolean not null default false;
alter table public.profiles add column thanks_card_dismissed_at timestamptz;

-- What members would like the host to pray about, preach on or cover at a
-- meeting. Private: only the member who sent it, the host and staff see it.
create table public.event_inputs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index event_inputs_event on public.event_inputs (event_id, created_at);
create index event_inputs_user on public.event_inputs (user_id);
alter table public.event_inputs enable row level security;
