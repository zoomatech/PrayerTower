-- A public waitlist page (concept document Phase 1: "one-page waitlist site with
-- email capture"; Research Questions: secrecy until launch). Off until an admin
-- turns on notebook_settings.waitlist_enabled. Admins invite people from the list.
alter table public.notebook_settings add column waitlist_enabled boolean not null default false;

create table public.waitlist_entries (
  id uuid primary key default public.uuid_v7(),
  email text not null check (char_length(email) between 3 and 320),
  name text not null default '' check (char_length(name) <= 80),
  note text not null default '' check (char_length(note) <= 300),
  edition text not null default 'prayer-tower' check (edition in ('prayer-tower', 'open-circle')),
  invite_code text references public.invite_codes (code) on delete set null,
  invited_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index waitlist_entries_email_uq on public.waitlist_entries (lower(email));
alter table public.waitlist_entries enable row level security;
