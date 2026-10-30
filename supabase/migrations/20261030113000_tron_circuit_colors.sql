-- Neon Circuit is the Tron-style skin (Steve, 2026-10-30): strong electric blue wires and red
-- screen tubes on near-black. Neon Cinderella is its own style and is unchanged.
update public.feed_themes
   set tokens = tokens || '{"backdrop": "#02040A", "wire": "#1E9BFF", "screen": "#FF2A1F"}'::jsonb
 where slug = 'neon-circuit';
