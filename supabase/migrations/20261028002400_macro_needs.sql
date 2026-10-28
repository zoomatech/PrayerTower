-- Macro Needs (notebook Page 3, roadmap Phase 2): a large need (a national
-- disaster, etc.) featured at the top of the feed with both prayer (pray,
-- commit, give tokens to its request) and material help (links to relief
-- partners chosen by staff). "Prayer without action is sounding brass."
-- The material-help partner process is not decided; partner links are a
-- staff-entered placeholder. Money never passes through Prayer Tower.

create table public.macro_needs (
  id uuid primary key default public.uuid_v7(),
  post_id uuid not null unique references public.posts (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  -- [{ "label": "...", "url": "https://..." }], at most 5.
  help_options jsonb not null default '[]'::jsonb check (jsonb_typeof(help_options) = 'array' and jsonb_array_length(help_options) <= 5),
  created_by uuid not null references public.profiles (id),
  ends_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index macro_needs_active_idx on public.macro_needs (created_at desc) where ended_at is null;

-- Members who say they gave material help (self-reported; nothing is charged here).
create table public.macro_need_helpers (
  need_id uuid not null references public.macro_needs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (need_id, user_id)
);

alter table public.macro_needs enable row level security;
alter table public.macro_need_helpers enable row level security;
