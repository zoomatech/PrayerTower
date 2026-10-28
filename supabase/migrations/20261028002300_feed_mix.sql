-- "Pick Your Prayer Mix" (roadmap Phase 2): each member can see more or less
-- of a post type or realm. Keys are 'type:<post type>' or 'realm:<realm>',
-- values 'less' or 'more'; missing means normal. It only reorders the feed:
-- nothing is ever hidden by it.
alter table public.profiles add column feed_mix jsonb not null default '{}'::jsonb
  check (jsonb_typeof(feed_mix) = 'object');
