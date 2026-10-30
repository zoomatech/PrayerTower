-- Word study, highlights and notes, and offline texts for Text search (docs/LIBRARY_SEARCH.md), all off by
-- default and only while text search itself is on.
-- Word study: tap a word of the King James Bible for its Hebrew or Greek root (Strong's numbers and Strong's
-- 1890/1894 dictionaries, public domain), its meaning and other verses using it. Faith communities only.
-- Highlights and notes: a member marks any passage in any collection with a colour and/or a note, private by
-- default; a note can be shared with one of their prayer circles.
-- Offline: the native app can download the collections the member is offered and search them with no signal.
alter table public.library_settings add column words_enabled boolean not null default false;
alter table public.library_settings add column notes_enabled boolean not null default false;
alter table public.library_settings add column offline_enabled boolean not null default false;

create table public.library_notes (
  id uuid primary key default public.uuid_v7(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  collection text not null check (collection ~ '^[a-z0-9-]{1,40}$'),
  work_id text not null check (char_length(work_id) between 1 and 80),
  -- Which passage: its reference and a fingerprint of its words, since some works give many passages one heading.
  ref text not null check (char_length(ref) <= 200),
  passage_key text not null check (char_length(passage_key) <= 64),
  -- The opening words and citation as they were, so the note still reads if a text is later rebuilt.
  quote text not null check (char_length(quote) <= 400),
  citation text not null check (char_length(citation) <= 300),
  color text check (color in ('yellow', 'green', 'blue', 'pink')),
  note text check (char_length(note) <= 2000),
  -- Shared with one of the member's prayer circles; private when null.
  circle_id uuid references public.prayer_circles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, collection, passage_key),
  check (color is not null or note is not null)
);
create index library_notes_circle_idx on public.library_notes (circle_id, updated_at desc);
alter table public.library_notes enable row level security;
