-- Harmful prayer requests (docs/HARMFUL_PRAYERS.md). Off by default.
-- A free word check sorts text into categories. Only obvious junk is refused
-- automatically; anything that may be real goes to a person, and none of it
-- is sent by radio or amplified until a person clears it.

create table public.harm_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  -- What happens per category: hold = hidden until a person decides; review = stays up,
  -- kept off radio, sent to the queue; support = stays up, help offered, queue; allow = nothing.
  threat_action text not null default 'hold' check (threat_action in ('hold', 'review', 'allow')),
  hate_action text not null default 'hold' check (hate_action in ('hold', 'review', 'allow')),
  harm_wish_action text not null default 'review' check (harm_wish_action in ('hold', 'review', 'allow')),
  curse_action text not null default 'review' check (curse_action in ('hold', 'review', 'allow')),
  revenge_action text not null default 'review' check (revenge_action in ('hold', 'review', 'allow')),
  abuse_action text not null default 'support' check (abuse_action in ('support', 'allow')),
  -- Swearing out of anguish is allowed. At this many swear words the text goes to a person (held).
  foul_hold_at int not null default 6 check (foul_hold_at between 2 and 1000),
  -- Text that is nothing but swearing (no other words to speak of) is refused at once: the only automatic refusal.
  foul_junk_filter boolean not null default true,
  -- Flood guard: after this many flagged items from one account in a day, more are held
  -- silently and bundled into one queue item instead of one item each.
  flood_per_day int not null default 5 check (flood_per_day between 1 and 1000),
  -- Admin-added words or phrases (e.g. slurs) treated as hate.
  extra_hate_words text[] not null default '{}',
  updated_at timestamptz not null default now()
);
insert into public.harm_settings default values;
alter table public.harm_settings enable row level security;

-- The category a post or comment was flagged with; cleared when a moderator dismisses the flag.
alter table public.posts add column harm_category text;
alter table public.comments add column harm_category text;

-- Every time the check flags something (including junk it refused, which has no target).
create table public.harm_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  target_type text check (target_type in ('post', 'comment', 'message')),
  target_id uuid,
  category text not null,
  action text not null check (action in ('filtered', 'hold', 'review', 'support', 'bundled')),
  created_at timestamptz not null default now(),
  cleared_at timestamptz
);
create index harm_events_user_day on public.harm_events (user_id, created_at);
alter table public.harm_events enable row level security;

-- One harm item per piece of content.
create unique index moderation_items_one_harm on public.moderation_items (target_type, target_id)
  where source = 'harm';
