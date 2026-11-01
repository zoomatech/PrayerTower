-- The Ceramic Figurine skin's own layout (Steve, 2026-10-31): pastel ceramic plaques in shadow
-- boxes, hauled up by angel figurines. Added on its own so the next migration can use it.
alter type public.feed_layout add value if not exists 'ceramic';
