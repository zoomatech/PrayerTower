-- A gentle giving ask, the Mastodon way (research/Contributing_Without_Ad_Money.md,
-- suggestion 11): shown once, only after a member has been here a while, easy to
-- dismiss, never repeated, and never to someone who already gave. Off by default.
alter table public.notebook_settings
  add column giving_ask_enabled boolean not null default false,
  add column giving_ask_after_days smallint not null default 28 check (giving_ask_after_days between 1 and 365);
alter table public.profiles add column giving_ask_seen_at timestamptz;
