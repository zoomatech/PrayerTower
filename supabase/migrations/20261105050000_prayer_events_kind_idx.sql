-- Feed speed: Praying Now counts (feed ranking and every card) filter prayer_events by post and kind.
-- prayer_events_post_idx is (post_id, created_at), so kind was checked row by row.
create index if not exists prayer_events_post_kind_idx on public.prayer_events (post_id, kind);
