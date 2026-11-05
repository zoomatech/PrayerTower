-- Prayers and posts (Steve, 2026-11-02): the writing screen sends either a prayer, which is
-- PrayerCast and counted when answered, or a post that is not a prayer. Posts that aren't
-- prayer are 'discussion' posts, so the default (Prayer Tower) community turns them on.
update public.communities
   set enabled_post_types = array_append(enabled_post_types, 'discussion'::public.post_type)
 where is_default and not ('discussion'::public.post_type = any (enabled_post_types));
