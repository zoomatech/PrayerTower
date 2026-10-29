-- Practice mode for the paid services (2026-10-29), three switches, all off.
-- Each one lets the feature be tried before its paid key is set:
-- - ai: the AI conversation, circle facilitator and Auto-Pray answer with a
--   fixed practice reply that says it is one.
-- - live: live rooms open a practice page on our own server instead of video.
-- - purchases: the token store takes practice purchases (no money, marked
--   "Practice"), only while no App Store connection is set and the server is
--   not set to the App Store's production environment.
-- A real key always wins: once it is set, its switch here does nothing.
create table public.paid_practice_settings (
  id boolean primary key default true check (id),
  ai boolean not null default false,
  live boolean not null default false,
  purchases boolean not null default false
);
insert into public.paid_practice_settings default values;
alter table public.paid_practice_settings enable row level security;
