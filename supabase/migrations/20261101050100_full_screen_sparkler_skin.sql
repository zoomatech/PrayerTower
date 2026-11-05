-- Full Screen Sparkler (gated, Admin → Feed skins), Steve 2026-11-01: a simple full-screen
-- scroll with no border. A line overlapping the posts on the left grows downward as you scroll,
-- with a sparkler at its tip leading the way. Posts are separated by a black line with a light
-- blue line through its middle. Each member picks the posts' background (solid colors,
-- starfields, flowers, textures) under Menu → Settings → Themes → Full Screen Sparkler Theme →
-- Background choices. Offered in every community.
insert into public.feed_themes (slug, name, layout, status, gated, animations, tokens) values
  ('full-screen-sparkler', 'Full Screen Sparkler', 'sparkler', 'beta', true, '{"enter": "fade"}',
   '{"backdrop": "#000000", "stripe": "#8FD3FF"}')
on conflict (slug) do nothing;
insert into public.community_feed_themes (community_id, theme_id, is_default)
select c.id, t.id, false from public.communities c, public.feed_themes t
 where t.slug = 'full-screen-sparkler'
on conflict do nothing;
