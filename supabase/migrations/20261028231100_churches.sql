-- Church partners: a pastor applies for their church, an admin checks it
-- (by phone, website or denomination directory) and verifies it. A verified
-- church's applicant gets the 'pastor' role and a "Pastor · <church>" badge
-- on their named posts. One open application (pending or verified) per member.

create type public.church_status as enum ('pending', 'verified', 'declined');

create table public.churches (
  id uuid primary key default public.uuid_v7(),
  applicant_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  denomination text check (char_length(denomination) <= 80),
  pastor_title text not null default 'Pastor' check (char_length(pastor_title) between 1 and 60),
  city text not null check (char_length(city) between 1 and 80),
  region text check (char_length(region) <= 80),
  country text not null check (char_length(country) between 2 and 60),
  website text check (char_length(website) <= 200),
  phone text check (char_length(phone) <= 40),
  about text check (char_length(about) <= 1000),
  status public.church_status not null default 'pending',
  -- Shown to the applicant when declined; staff-written.
  review_note text check (char_length(review_note) <= 500),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index churches_one_open_per_applicant on public.churches (applicant_id) where status <> 'declined';
create index churches_status_idx on public.churches (status, id);

alter table public.churches enable row level security;
