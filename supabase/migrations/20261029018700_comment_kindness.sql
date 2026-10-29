-- Three ideas mined from research/Kind_Interaction_UX_Research.md, each off by default:
--  * Author's heart: the person who asked can heart a comment on their post, like a
--    YouTube creator heart (linked to ~22% more comments). Shown as "loved by the person
--    who asked", never as a count.
--  * Thank privately: any member can thank someone for a comment, like Wikipedia's
--    Thanks (+43% thanks sent, better retention). Only the commenter hears; no counts.
--  * Quiet counts: each member chooses, as on Instagram, to hide prayer numbers on posts
--    they see, or on their own posts for others. "People are praying with you" stays.
alter table public.conversation_settings
  add column author_hearts_enabled boolean not null default false,
  add column comment_thanks_enabled boolean not null default false,
  add column quiet_counts_enabled boolean not null default false;

create table public.comment_hearts (
  comment_id uuid primary key references public.comments (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.comment_hearts enable row level security;

create table public.comment_thanks (
  comment_id uuid not null references public.comments (id) on delete cascade,
  from_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, from_id)
);
create index comment_thanks_from_id_idx on public.comment_thanks (from_id);
alter table public.comment_thanks enable row level security;

create table public.quiet_count_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  hide_seen boolean not null default false,
  hide_mine boolean not null default false
);
alter table public.quiet_count_prefs enable row level security;
