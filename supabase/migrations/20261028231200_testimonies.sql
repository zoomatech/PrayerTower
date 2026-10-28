-- Answered-prayer testimonies: once a request is answered, the poster can tell
-- what God did. Shown on the card and in the Testimonies feed filter.
alter table public.posts
  add column testimony text check (char_length(testimony) between 1 and 2000),
  add column testimony_at timestamptz,
  add constraint posts_testimony_when_answered check (testimony is null or state = 'answered');
create index posts_testimony_idx on public.posts (testimony_at desc) where testimony is not null;
