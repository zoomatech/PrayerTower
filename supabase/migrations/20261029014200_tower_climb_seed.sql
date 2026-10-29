-- Gated like the other skins: offered only while Admin → Feed skins →
-- "Show the new feed skins" is on. Which way a swipe climbs is each member's
-- choice on the tower itself (docs/FEED_SKINS.md, Tower climb). Faith
-- communities get "Prayer Tower"; Open Circle gets the same tower as
-- "Climbing Tower", with no religious word in its name.
insert into public.feed_themes (slug, name, layout, status, gated, animations, tokens) values
  ('prayer-tower', 'Prayer Tower', 'tower', 'beta', true, '{"enter": "climb"}',
   '{"stone": "#B9AE9C", "mortar": "#8F8574", "backdrop": "#EAF2F8", "climber": "🧗"}'),
  ('climbing-tower', 'Climbing Tower', 'tower', 'beta', true, '{"enter": "climb"}',
   '{"stone": "#B9AE9C", "mortar": "#8F8574", "backdrop": "#EAF2F8", "climber": "🧗"}')
on conflict (slug) do nothing;
insert into public.community_feed_themes (community_id, theme_id, is_default)
select c.id, t.id, false
  from public.communities c, public.feed_themes t
 where (t.slug = 'prayer-tower' and c.slug <> 'open-circle') or (t.slug = 'climbing-tower' and c.slug = 'open-circle')
on conflict do nothing;
