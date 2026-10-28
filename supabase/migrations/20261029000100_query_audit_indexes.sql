-- Indexes from the query audit at 1,000 members (docs/QUERY_AUDIT.md).
--
-- "Most prayed for this week" (highlights), the prayer-warriors list and the
-- weekly pilot report all read recent prayer events by time. Without this they
-- scanned the whole table; the included columns let them answer from the index.
create index if not exists prayer_events_recent_idx on public.prayer_events (created_at desc) include (post_id, user_id, kind);

-- "Answered this week" (highlights) and the pilot report's answered count.
create index if not exists posts_answered_idx on public.posts (answered_at desc) where answered_at is not null;

-- The pilot report's requests posted per week.
create index if not exists posts_requests_recent_idx on public.posts (created_at desc) where post_type = 'prayer_request';
