-- Limits from the abuse tests (apps/server/test/abuse.test.ts, docs/ABUSE_TESTS.md).

-- 1. Token farming: a member could tap "praying now" on one request every 60
--    seconds and have each tap count as a verified prayer toward Priestly
--    tokens (about 144 a day). A verified prayer now also has to be the
--    member's first verified prayer for that request that UTC day, and a member
--    gets at most verified_prayers_per_day of them a day (0 = no cap).
alter table public.token_settings add column verified_prayers_per_day int not null default 50 check (verified_prayers_per_day >= 0);

create or replace function public.prayer_events_verify() returns trigger
language plpgsql as $$
declare
  v_gap int;
  v_cap int;
  v_last timestamptz;
  v_day_start timestamptz := date_trunc('day', new.created_at at time zone 'utc') at time zone 'utc';
begin
  select verified_prayer_min_gap_seconds, verified_prayers_per_day into v_gap, v_cap from public.token_settings;
  select max(created_at) into v_last from public.prayer_events where user_id = new.user_id;
  new.verified := (select p.user_id <> new.user_id from public.posts p where p.id = new.post_id)
    and (v_last is null or new.created_at - v_last >= make_interval(secs => coalesce(v_gap, 0)))
    and not exists (
      select 1 from public.prayer_events e
       where e.user_id = new.user_id and e.post_id = new.post_id and e.verified and e.created_at >= v_day_start)
    and (coalesce(v_cap, 0) = 0 or (
      select count(*) from public.prayer_events e
       where e.user_id = new.user_id and e.verified and e.created_at >= v_day_start) < v_cap);
  return new;
end;
$$;

-- 2. Flooding: established members had no cap on requests, comments or
--    messages beyond the API's per-minute rate limit. These apply to everyone
--    except admins and moderators (0 = no cap), on top of the new-member limits.
alter table public.safety_settings
  add column posts_per_hour int not null default 10 check (posts_per_hour >= 0),
  add column comments_per_hour int not null default 60 check (comments_per_hour >= 0),
  add column messages_per_minute int not null default 20 check (messages_per_minute >= 0);
