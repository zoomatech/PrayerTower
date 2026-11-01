-- The Ceramic Figurines skin's own layout (Steve, 2026-10-31): ceramic plaques on platforms
-- hauled up by angels on pulleys. Added on its own so the next migration can use it.
alter type public.feed_layout add value if not exists 'ceramic';
