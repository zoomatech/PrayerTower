-- Ceramic Figurines (gated, Admin → Feed skins), Steve 2026-10-31: the "elegant retired lady
-- version". Pastel, unglazed ceramic plaques with etched edges in shadow boxes, standing on
-- platforms that angels haul up toward heaven with ropes and white pulleys; comments on
-- ceramic placards tied under each platform. Offered in the faith communities (it has angels
-- and heaven), not in Open Circle.
insert into public.feed_themes (slug, name, layout, status, gated, animations, tokens) values
  ('ceramic-figurines', 'Ceramic Figurines', 'ceramic', 'beta', true, '{"enter": "fade"}',
   '{"backdrop": "#EAE6F1", "frame": "#F1E4DF", "recess": "#E5DAD5", "platform": "#EADDD7", "placard": "#F7F1EE", "reply": "#E6DEF0", "ink": "#4B3F47"}')
on conflict (slug) do nothing;
insert into public.community_feed_themes (community_id, theme_id, is_default)
select c.id, t.id, false from public.communities c, public.feed_themes t
 where t.slug = 'ceramic-figurines' and c.slug <> 'open-circle'
on conflict do nothing;
