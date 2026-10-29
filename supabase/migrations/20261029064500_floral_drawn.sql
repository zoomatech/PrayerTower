-- Blossom Garden drawn as a climbing rose (vineStyle 'floral'): a twining stem
-- with thorns and blossoms, and each post in a scalloped petal frame with a
-- drawn rose. See docs/FEED_SKINS.md.
update public.feed_themes set tokens = tokens || '{"vineStyle": "floral", "stemWidth": 3}'::jsonb where slug = 'blossom-garden';
