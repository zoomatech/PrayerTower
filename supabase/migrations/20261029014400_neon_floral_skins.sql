-- Three more gated skins (Admin → Feed skins), offered in every community:
--   * Neon Cinderella: glowing outlines on a night sky, star leaves, and our own
--     neon drawings of a castle, a pumpkin coach and a glass slipper.
--   * Neon Circuit: posts in tilted screens on a live wire with gentle bursts.
--   * Blossom Garden: a soft floral vine; requests and comments bloom as flowers.
insert into public.feed_themes (slug, name, layout, status, gated, animations, tokens) values
  ('neon-cinderella', 'Neon Cinderella', 'vine', 'beta', true, '{"enter": "blossom", "answered": "bloom", "idleBird": false}',
   '{"backdrop": "#0B0820", "stem": "#FF5FD2", "stemGlow": true, "stemWidth": 3, "branch": "#FFD36E", "leaf": "#7DF9FF",
     "leafSoft": "#F3EDFF", "tendril": "#FFD36E", "leafShape": "star", "scenery": "fairytale", "leafEvery": 4,
     "tipText": "You have reached the top of the stairs. The clock has not struck midnight yet; come back soon."}'),
  ('neon-circuit', 'Neon Circuit', 'circuit', 'beta', true, '{"enter": "fade"}',
   '{"backdrop": "#05070D", "wire": "#00E5FF", "burst": "#FFFFFF", "screen": "#FF2BD6", "tilt": 10}'),
  ('blossom-garden', 'Blossom Garden', 'vine', 'beta', true, '{"enter": "blossom", "answered": "bloom", "idleBird": true}',
   '{"backdrop": "#FFF5F8", "stem": "#7A9E5A", "stemWidth": 5, "branch": "#B5838D", "leaf": "#F48FB1", "leafSoft": "#FFF0F5",
     "tendril": "#C2185B", "leafShape": "flower", "leafEvery": 4,
     "tipText": "You have reached the end of the garden path. Come back later to see what blooms."}')
on conflict (slug) do nothing;
insert into public.community_feed_themes (community_id, theme_id, is_default)
select c.id, t.id, false from public.communities c, public.feed_themes t
 where t.slug in ('neon-cinderella', 'neon-circuit', 'blossom-garden')
on conflict do nothing;
