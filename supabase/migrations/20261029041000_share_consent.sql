-- Sharing outside the app, only with the author's consent (Steve, 2026-10-29:
-- opt-in sharing of posts beyond our ecosystem; a prayer request is never
-- shared without its author saying so). Off until Admin → Growth turns it on.
-- With it on, each author chooses per post who may share it outside:
--   no row  → nobody but the author, and then only as a members-only app link;
--   'link'  → anyone who can see it may send the app link, never the words;
--   'card'  → anyone may send a share card: a public page with the words and,
--             unless the post is anonymous, the author's first name.
-- Turning a post back to private deletes the row, which kills the card link.
alter table public.growth_settings add column share_consent_enabled boolean not null default false;

create table public.share_consents (
  post_id uuid primary key references public.posts (id) on delete cascade,
  level text not null check (level in ('link', 'card')),
  token text not null unique check (length(token) >= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.share_consents enable row level security;
