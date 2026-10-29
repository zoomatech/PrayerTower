-- Kindness highlights (docs/GROWTH_PRACTICES.md): a weekly set of real examples of
-- members lifting each other up, shown without names. Off until Admin → Growth
-- practices turns it on. Every step needs a person:
--   1. The person who was lifted up taps "This lifted me up" on a comment on their request.
--   2. The comment's author is asked, and only a yes lets it be considered.
--   3. An admin picks this week's highlights and may trim the words to remove names.
--   4. The author can withdraw at any time, and it disappears at once.
alter table public.practice_settings add column highlights_enabled boolean not null default false;

create table public.kindness_nominations (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null unique references public.comments (id) on delete cascade,
  nominated_by uuid not null references public.profiles (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  community_id uuid references public.communities (id) on delete cascade,
  status text not null default 'asked' check (status in ('asked', 'consented', 'declined', 'picked', 'withdrawn')),
  -- What members see: the comment's words, trimmed by the admin to keep it anonymous.
  shown_text text check (length(shown_text) between 1 and 600),
  week date,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index kindness_nominations_nominated_by_idx on public.kindness_nominations (nominated_by);
create index kindness_nominations_author_idx on public.kindness_nominations (author_id);
create index kindness_nominations_community_idx on public.kindness_nominations (community_id);
create index kindness_nominations_week_idx on public.kindness_nominations (week) where status = 'picked';
alter table public.kindness_nominations enable row level security;
