-- Station batch 6 (docs/RADIO_BURST.md: "Answered: a thanksgiving burst" and
-- "I'm praying too"). Both off by default.
--
-- radio_thanksgiving_enabled: when a member marks answered a request that went out
-- by radio, one short thanksgiving prayer (kind 'thanksgiving') is queued for the
-- station, free, at most once per request.
-- listener_praying_enabled: a listener who decoded a prayer can tap "I'm praying
-- too"; the app sends the prayer's fingerprint (never the words, never who they are)
-- and the radio prayer's anonymous count goes up.
alter table public.token_settings
  add column radio_thanksgiving_enabled boolean not null default false,
  add column listener_praying_enabled boolean not null default false;

alter table public.radio_prayers
  add column kind text not null default 'prayer' check (kind in ('prayer', 'thanksgiving')),
  add column listener_praying integer not null default 0 check (listener_praying >= 0);

-- A thanksgiving row is free and sent by the poster: keep it out of the
-- one-free-send-per-request rule, and allow one per request.
drop index public.radio_prayers_free_once_uq;
create unique index radio_prayers_free_once_uq on public.radio_prayers (user_id, post_id, (repeats > 1))
  where cost = 0 and status <> 'failed' and kind = 'prayer';
create unique index radio_prayers_thanksgiving_uq on public.radio_prayers (post_id) where kind = 'thanksgiving';
