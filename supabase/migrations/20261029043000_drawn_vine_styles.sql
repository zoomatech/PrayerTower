-- Drawn vine styles (Steve, 2026-10-29): Beanstalk twists like a fairy-tale beanstalk,
-- Golden Wood is drawn in pen and ink, and Neon Cinderella is glowing neon rods with no
-- plant at all. See docs/FEED_SKINS.md.
update public.feed_themes set tokens = tokens || '{"vineStyle": "beanstalk", "stemWidth": 12}'::jsonb where slug = 'beanstalk';
update public.feed_themes set tokens = tokens || '{"vineStyle": "ink", "ink": "#3A2E1F"}'::jsonb where slug = 'golden-wood';
update public.feed_themes set tokens = tokens || '{"vineStyle": "neon", "leaf": "#8FB3FF", "stemWidth": 3}'::jsonb where slug = 'neon-cinderella';
