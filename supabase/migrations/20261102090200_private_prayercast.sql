-- PrayerCast privately (Steve, 2026-11-02): a prayer directed to God, sent by radio but never
-- shown, its words forgotten once sent. Such a request is marked 'private_cast', so every
-- place that shows only 'visible' posts leaves it out.
alter type public.moderation_status add value if not exists 'private_cast';
