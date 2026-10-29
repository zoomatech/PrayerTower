-- Thank the pray-ers: the person who asked sends one warm note to everyone who prayed
-- (a gratitude letter, with starters to help). Pray-ers can answer with "Glad to".
-- Off by default.
alter table public.practice_settings add column thank_note_enabled boolean not null default false;

create table public.thank_notes (
  post_id uuid primary key references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 600),
  created_at timestamptz not null default now()
);
create index thank_notes_user_id_idx on public.thank_notes (user_id);
alter table public.thank_notes enable row level security;

create table public.thank_note_glad (
  post_id uuid not null references public.thank_notes (post_id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index thank_note_glad_user_id_idx on public.thank_note_glad (user_id);
alter table public.thank_note_glad enable row level security;
