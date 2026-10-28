-- Bug hunt 3: one free radio prayer per member per request, but
--   * an Amplify (repeats > 1) is a separate prayer from a plain one, and
--   * a prayer that failed (station error, refused) can be sent again.
-- The old index counted both as duplicates, so the insert failed with a 500.
drop index public.radio_prayers_free_once_uq;
create unique index radio_prayers_free_once_uq on public.radio_prayers (user_id, post_id, (repeats > 1))
  where cost = 0 and status <> 'failed';
