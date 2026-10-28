-- Swipe-to-pray (notebook: "swipe left to move on, swipe right to pray"), a
-- beta carousel feed style members can opt into. Swiping right opens Praying
-- Now, so a prayer is still a deliberate act.
insert into public.feed_themes (slug, name, layout, status, animations) values
  ('swipe', 'Swipe to pray', 'carousel', 'beta', '{"enter": "deal"}');
insert into public.community_feed_themes (community_id, theme_id, is_default)
select public.default_community_id(), id, false from public.feed_themes where slug = 'swipe';
