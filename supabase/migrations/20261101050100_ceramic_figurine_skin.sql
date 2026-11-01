-- Ceramic Figurine (gated, Admin → Feed skins), Steve 2026-10-31, the "elegant retired lady
-- version": pastel unglazed ceramic plaques with etched edges in shadow boxes, angel figurines
-- hauling each prayer up on ropes over white pulleys, comments on ceramic placards tied below,
-- figurines each member picks. Angels are religious imagery, so it is not offered in Open Circle.
insert into public.feed_themes (slug, name, layout, status, gated, animations, tokens) values
  ('ceramic-figurine', 'Ceramic Figurine', 'ceramic', 'beta', true, '{"enter": "settle"}',
   '{"backdrop": "#EAE6F1"}')
on conflict (slug) do nothing;
insert into public.community_feed_themes (community_id, theme_id, is_default)
select c.id, t.id, false from public.communities c, public.feed_themes t
 where t.slug = 'ceramic-figurine' and c.slug <> 'open-circle'
on conflict do nothing;
