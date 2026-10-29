-- "Prayer answered" stories (docs/GROWTH_PRACTICES.md). Off until Admin → Growth
-- practices turns it on. The person who posted a request can post one short story of
-- how it turned out. It is its own post (a testimony / story), linked back to the
-- request, and everyone who prayed for the request hears about it once.
alter table public.practice_settings
  add column answered_stories_enabled boolean not null default false;

alter table public.posts
  add column answers_post_id uuid references public.posts (id) on delete set null;
-- One story per request.
create unique index posts_answers_post_id_key on public.posts (answers_post_id) where answers_post_id is not null;
