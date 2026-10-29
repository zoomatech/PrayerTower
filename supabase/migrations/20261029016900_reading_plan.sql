-- Bible reading plan (Annotated Read, chat 2: "There could be a Bible study site"). Off by
-- default. Staff (admins and pastors) set a plan of daily passages for a community;
-- members see today's passage, open it on a Bible website, mark it read, and can talk it
-- over in the plan's group chat. Never shown in a community with neutral wording.
alter table public.notebook_settings add column reading_plan_enabled boolean not null default false;
-- Where a passage opens; {ref} is replaced with the passage, URL-encoded.
alter table public.notebook_settings add column reading_plan_url text not null
  default 'https://www.biblegateway.com/passage/?search={ref}&version=WEB'
  check (reading_plan_url like 'https://%' and reading_plan_url like '%{ref}%' and char_length(reading_plan_url) <= 300);

create table public.reading_plans (
  id uuid primary key default public.uuid_v7(),
  community_id uuid not null references public.communities (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  starts_on date not null,
  created_by uuid references public.profiles (id) on delete set null,
  -- An optional group chat where members talk the readings over.
  conversation_id uuid references public.conversations (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index reading_plans_community_idx on public.reading_plans (community_id, starts_on desc) where archived_at is null;
create index reading_plans_created_by_fk_idx on public.reading_plans (created_by);
create index reading_plans_conversation_fk_idx on public.reading_plans (conversation_id);

create table public.reading_plan_days (
  plan_id uuid not null references public.reading_plans (id) on delete cascade,
  day int not null check (day between 1 and 366),
  reference text not null check (char_length(reference) between 1 and 100),
  primary key (plan_id, day)
);

create table public.reading_plan_reads (
  plan_id uuid not null references public.reading_plans (id) on delete cascade,
  day int not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (plan_id, day, user_id)
);
create index reading_plan_reads_user_idx on public.reading_plan_reads (user_id);

alter table public.reading_plans enable row level security;
alter table public.reading_plan_days enable row level security;
alter table public.reading_plan_reads enable row level security;
