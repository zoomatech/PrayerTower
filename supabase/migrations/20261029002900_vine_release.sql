-- Vine 2.0 leaves beta (Steve's 2026-10-28 work list). It stays a style each
-- member opts into; the Classic column is still every community's default.
-- Open Circle gets the same feed styles (its Vine shows no scripture leaves).
update public.feed_themes set status = 'active' where slug = 'vine';
insert into public.community_feed_themes (community_id, theme_id, is_default)
select c.id, t.id, t.slug = 'column'
  from public.communities c, public.feed_themes t
 where c.slug = 'open-circle' and t.slug in ('column', 'vine', 'flip', 'swipe')
on conflict do nothing;
