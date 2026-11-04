-- Video circles (docs/VIDEO_CIRCLES.md; notebook Page 12: "move disputes to a video
-- circle, so there is no hiding behind posts"). Off until Admin → Live video turns it
-- on, and it also needs Mend. A moderator offers a short, private video circle about
-- a Mend. The hurt person is asked first and the author is asked only if they say
-- yes, so the author never learns who was hurt unless that person wants to meet.
-- Nobody is pressed, and the room's address is given out only once both said yes.
alter table public.live_settings add column circles_enabled boolean not null default false;

create table public.video_circles (
  id uuid primary key default public.uuid_v7(),
  mend_id uuid not null references public.mends (id) on delete cascade,
  moderator_id uuid references public.profiles (id) on delete set null,
  -- The moderator's few words to both members.
  note text check (note is null or char_length(note) between 1 and 400),
  -- asked_hurt → asked_author → ready → ended; declined at either step.
  status text not null default 'asked_hurt' check (status in ('asked_hurt', 'asked_author', 'ready', 'declined', 'ended')),
  -- Whether the author was ever asked. A circle the hurt person declined stays invisible to the author.
  author_asked boolean not null default false,
  room_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index video_circles_open_idx on public.video_circles (mend_id) where status in ('asked_hurt', 'asked_author', 'ready');
create index video_circles_mend_idx on public.video_circles (mend_id);
create index video_circles_moderator_idx on public.video_circles (moderator_id);
alter table public.video_circles enable row level security;
