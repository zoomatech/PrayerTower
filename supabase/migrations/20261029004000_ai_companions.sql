-- AI conversation ("not God") and the AI first-step circle facilitator.
-- Both are off by default. Nothing is sent to an AI until an admin turns a
-- switch on AND the server has ANTHROPIC_API_KEY. Conversations are not stored;
-- only a per-day count (for the daily limit) and circle requests a member
-- chooses to send are kept.
--
-- The chat's on/off switch and its warning stay in future_settings
-- (ai_chat_enabled, ai_chat_warning). The rest lives here.

create table public.ai_settings (
  id boolean primary key default true check (id),
  chat_daily_limit int not null default 20 check (chat_daily_limit between 1 and 500),
  facilitator_enabled boolean not null default false,
  facilitator_daily_limit int not null default 30 check (facilitator_daily_limit between 1 and 500)
);
insert into public.ai_settings default values;

create table public.ai_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null default current_date,
  kind text not null check (kind in ('chat', 'facilitator')),
  turns int not null default 0,
  primary key (user_id, day, kind)
);

-- A member who prepared with the facilitator can ask staff for a restorative
-- circle. Only the member's own summary is sent, never the conversation.
create table public.circle_requests (
  id uuid primary key default public.uuid_v7(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('harmed', 'caused', 'unsure')),
  summary text not null check (char_length(summary) between 1 and 2000),
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index circle_requests_open on public.circle_requests (created_at) where status = 'open';

alter table public.ai_settings enable row level security;
alter table public.ai_usage enable row level security;
alter table public.circle_requests enable row level security;
