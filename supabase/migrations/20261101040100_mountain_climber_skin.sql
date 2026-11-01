-- Mountain Climber (gated, Admin → Feed skins), Steve 2026-10-31: a light brown and gray
-- rock face whose left edge is the cliff edge, a Swiss climber who climbs up and rappels
-- down it on an endless rope as you scroll, posts in smoothed squares of the rock, and
-- comments on rocks below them. Offered in every community.
insert into public.feed_themes (slug, name, layout, status, gated, animations, tokens) values
  ('mountain-climber', 'Mountain Climber', 'climb', 'beta', true, '{"enter": "fade"}',
   '{"backdrop": "#B8AB96", "slab": "#F1EBE0"}')
on conflict (slug) do nothing;
insert into public.community_feed_themes (community_id, theme_id, is_default)
select c.id, t.id, false from public.communities c, public.feed_themes t
 where t.slug = 'mountain-climber'
on conflict do nothing;
