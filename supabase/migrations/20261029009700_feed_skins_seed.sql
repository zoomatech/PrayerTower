-- The first skins (separate file: a new enum value can't be used in the
-- transaction that adds it). All gated, so members see none of them until
-- Admin → Feed skins → "Show the new feed skins" is on. Names are our own;
-- the elven skins are only inspired by golden woods and moonlit stone gates.
insert into public.feed_themes (slug, name, layout, status, gated, animations, tokens) values
  ('beanstalk', 'Beanstalk', 'vine', 'beta', true, '{"enter": "blossom", "answered": "bloom", "idleBird": true}',
   '{"stem": "#4F8A2E", "leaf": "#8CC152", "leafSoft": "#EEF7E3", "branch": "#6B8E23", "tendril": "#2E6B1F",
     "backdrop": "#F6FBF1", "stemWidth": 10, "leafEvery": 4, "leafShape": "round",
     "tipText": "You have reached the top of the beanstalk. Come back later to see how high it grows."}'),
  ('golden-wood', 'Golden Wood', 'vine', 'beta', true, '{"enter": "blossom", "answered": "bloom", "idleBird": false}',
   '{"stem": "#B8B4A8", "leaf": "#D9B648", "leafSoft": "#FBF5E1", "branch": "#9C968A", "tendril": "#8C6D12",
     "backdrop": "#FFFCF2", "stemWidth": 8, "leafEvery": 4, "leafShape": "pointed",
     "tipText": "You have reached the crown of the golden wood. Rest under its leaves, or come back later to see it grow."}'),
  ('moonlit-gate', 'Moonlit Gate', 'vine', 'beta', true, '{"enter": "fade", "answered": "glow", "idleBird": false}',
   '{"stem": "#AFC3D6", "leaf": "#DCE7F2", "leafSoft": "#EEF3F8", "branch": "#8FA6BD", "tendril": "#3B5C7E",
     "backdrop": "#E7ECF2", "stemWidth": 3, "stemDouble": true, "leafEvery": 4, "leafShape": "pointed",
     "tipText": "You have reached the arch of the gate. Speak a kind word, and come back later to see it grow."}'),
  ('wall', 'Wall', 'wall', 'beta', true, '{"enter": "fade"}', '{"backdrop": "#101418"}')
on conflict (slug) do nothing;

-- Offered in every community (Open Circle too: the skins carry no religious words).
insert into public.community_feed_themes (community_id, theme_id, is_default)
select c.id, t.id, false
  from public.communities c, public.feed_themes t
 where t.slug in ('beanstalk', 'golden-wood', 'moonlit-gate', 'wall')
on conflict do nothing;
