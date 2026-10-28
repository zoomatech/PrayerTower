-- Witness team tools (notebook Page 3: "Resource managers will scan for
-- sincere prayers and reach out"; Business Plan 6.4). Staff mark a sincere
-- need, keep private notes, and log help sent. No money moves through the app;
-- the Common Prayer Fund that pays for help waits on token purchase.

create type public.witness_status as enum ('watching', 'reaching_out', 'helped', 'closed');

create table public.witness_cases (
  id uuid primary key default public.uuid_v7(),
  post_id uuid not null unique references public.posts (id) on delete cascade,
  community_id uuid not null references public.communities (id),
  flagged_by uuid not null references public.profiles (id),
  status public.witness_status not null default 'watching',
  assigned_to uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index witness_cases_status_idx on public.witness_cases (status, id);

-- Append-only notes and help log.
create table public.witness_notes (
  id uuid primary key default public.uuid_v7(),
  case_id uuid not null references public.witness_cases (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  body text not null check (char_length(body) between 1 and 2000),
  -- Set when this note records help sent (e.g. "groceries", "rent", "a visit").
  help_kind text check (char_length(help_kind) <= 60),
  created_at timestamptz not null default now()
);
create index witness_notes_case_idx on public.witness_notes (case_id, id);

alter table public.witness_cases enable row level security;
alter table public.witness_notes enable row level security;
