-- Law-enforcement escalation and evidence holds (Notes p14: "law enforcement
-- and consequences for bad actors"). Off by default (legal_settings.enabled).
--   * A case records a request from an agency (preservation, legal process,
--     emergency) or a referral a moderator escalates from the queue.
--   * A hold copies a member's account record, posts, comments, sent messages
--     and moderation history into evidence_items at the moment it is placed,
--     so the copy survives the member deleting things or their whole account.
--   * Releasing a hold (or closing its case) erases the copy.
-- Admins only; every action is in the audit log. Staff decide what to disclose,
-- outside the app (docs/LEGAL_CASES.md).
create table public.legal_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  -- How long a new hold lasts unless an admin extends or releases it.
  default_hold_days int not null default 90 check (default_hold_days between 1 and 3650)
);
insert into public.legal_settings default values;
alter table public.legal_settings enable row level security;

create type public.legal_case_kind as enum ('preservation', 'legal_process', 'emergency', 'referral');
create type public.legal_case_status as enum ('open', 'closed');

create table public.legal_cases (
  id uuid primary key default public.uuid_v7(),
  kind public.legal_case_kind not null,
  status public.legal_case_status not null default 'open',
  -- The agency and its reference number (blank for a referral not yet sent).
  agency text check (agency is null or char_length(agency) <= 200),
  reference text check (reference is null or char_length(reference) <= 200),
  received_at timestamptz,
  -- Kept without a foreign key, so a case outlives the member's account.
  subject_user_id uuid,
  moderation_item_id uuid references public.moderation_items (id) on delete set null,
  summary text not null check (char_length(summary) between 1 and 4000),
  opened_by uuid references public.profiles (id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger legal_cases_touch before update on public.legal_cases for each row execute function public.touch_updated_at();
alter table public.legal_cases enable row level security;

create table public.legal_case_notes (
  id uuid primary key default public.uuid_v7(),
  case_id uuid not null references public.legal_cases (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
alter table public.legal_case_notes enable row level security;

create table public.evidence_holds (
  id uuid primary key default public.uuid_v7(),
  case_id uuid not null references public.legal_cases (id) on delete cascade,
  user_id uuid not null,
  placed_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null,
  released_at timestamptz,
  created_at timestamptz not null default now()
);
create index evidence_holds_user on public.evidence_holds (user_id) where released_at is null;
alter table public.evidence_holds enable row level security;

create table public.evidence_items (
  hold_id uuid not null references public.evidence_holds (id) on delete cascade,
  kind text not null check (kind in ('profile', 'post', 'comment', 'message', 'moderation_item', 'moderation_action')),
  source_id uuid not null,
  created_at timestamptz,
  data jsonb not null,
  primary key (hold_id, kind, source_id)
);
alter table public.evidence_items enable row level security;
