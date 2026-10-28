-- Every moderation action names the rule it applied, tells the member, and can
-- be appealed once (eSafety Safety by Design: clear consequences, outcomes and
-- a way to appeal).

alter table public.moderation_items add column rule text check (char_length(rule) <= 40);

create type public.appeal_status as enum ('pending', 'upheld', 'overturned');

create table public.moderation_appeals (
  id uuid primary key default public.uuid_v7(),
  moderation_item_id uuid not null unique references public.moderation_items (id),
  user_id uuid not null references public.profiles (id) on delete cascade,
  message text not null check (char_length(message) between 1 and 1000),
  status public.appeal_status not null default 'pending',
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 1000),
  created_at timestamptz not null default now()
);
create index moderation_appeals_pending_idx on public.moderation_appeals (created_at) where status = 'pending';
alter table public.moderation_appeals enable row level security;
