-- Seeding beneficial prayers (notebook Page 9: "INTENTIONALLY SEED the kinds of
-- prayers that are beneficial to society & elevate love, acceptance, kindness").
-- Off by default. Staff keep a library of prayers. Nothing is posted until an
-- admin approves the text. Approved prayers are posted on a schedule from one
-- real staff account (publish_as, e.g. "Prayer Tower team"), never as made-up members.
create table public.seed_prayer_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  -- The staff account the prayers are posted from. Must be an admin or moderator.
  publish_as uuid references public.profiles (id) on delete set null,
  max_per_day int not null default 1 check (max_per_day between 1 and 24)
);
insert into public.seed_prayer_settings default values;
alter table public.seed_prayer_settings enable row level security;

create type public.seed_prayer_status as enum ('draft', 'approved', 'published', 'retired');

create table public.seed_prayers (
  id uuid primary key default public.uuid_v7(),
  post_type public.post_type not null default 'open_prayer',
  body text not null check (char_length(body) between 1 and 10000),
  theme text check (char_length(theme) <= 40),
  status public.seed_prayer_status not null default 'draft',
  -- Not posted before this time (null: as soon as it's due).
  publish_after timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  published_post_id uuid references public.posts (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index seed_prayers_due on public.seed_prayers (publish_after nulls first, id) where status = 'approved';
alter table public.seed_prayers enable row level security;

-- Starter drafts for an admin to edit, approve or retire. None is posted until approved.
insert into public.seed_prayers (post_type, theme, body) values
  ('open_prayer', 'kindness', 'Lord, make us gentle with each other today. Help us answer impatience with patience and harsh words with kind ones.'),
  ('open_prayer', 'love', 'Father, teach us to love the neighbor we find hardest to love, and to see in them someone You made and cherish.'),
  ('open_prayer', 'acceptance', 'God, help us welcome the people who feel left out. Let no one leave our churches, homes or tables feeling unwanted.'),
  ('open_prayer', 'peace', 'Prince of Peace, quiet the anger in our country. Help us listen before we speak and pray for those we disagree with.'),
  ('open_prayer', 'gratitude', 'Thank You, Lord, for the people who prayed for us when we could not pray for ourselves. Make us that kind of friend to someone today.');
