-- Looking after moderators, and letting members explain a held post (docs/HARMFUL_PRAYERS.md).

-- Moderator wellbeing: off by default.
create table public.moderator_care_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  -- Hard items (threats, hate, harm, crisis, auto-hidden) show blurred until tapped.
  blur_hard boolean not null default true,
  -- Offer a break after this many minutes in the queue, or this many hard items read. 0 = never.
  break_after_minutes int not null default 20 check (break_after_minutes between 0 and 600),
  break_after_hard_items int not null default 10 check (break_after_hard_items between 0 and 1000),
  break_minutes int not null default 5 check (break_minutes between 1 and 120),
  updated_at timestamptz not null default now()
);
insert into public.moderator_care_settings default values;
alter table public.moderator_care_settings enable row level security;

-- Handing an item to another moderator (or to anyone else), with a note.
alter table public.moderation_items
  add column handoff_from uuid references public.profiles (id) on delete set null,
  add column handoff_to uuid references public.profiles (id) on delete set null,
  add column handoff_note text check (char_length(handoff_note) <= 500),
  add column handoff_at timestamptz,
  -- A member's explanation of their own held post, read with the item.
  add column author_note text check (char_length(author_note) <= 1000),
  add column author_noted_at timestamptz;
create index moderation_items_handoff_to on public.moderation_items (handoff_to) where handoff_to is not null;
create index moderation_items_handoff_from on public.moderation_items (handoff_from) where handoff_from is not null;

-- Members whose post was held can explain it (on unless an admin turns it off).
alter table public.harm_settings add column explain_held boolean not null default true;
