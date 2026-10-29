-- Circle updates (docs/GROWTH_PRACTICES.md), off: the person who shared in a prayer circle can add
-- "how it's going" and mark it answered; the people who prayed get a quiet in-app note. With it
-- on, a "three good things" card can also be shared to one of the member's circles.
alter table public.practice_settings add column circle_updates_enabled boolean not null default false;
alter table public.circle_posts
  add column update_text text check (char_length(update_text) <= 600),
  add column update_at timestamptz,
  add column answered boolean not null default false;
