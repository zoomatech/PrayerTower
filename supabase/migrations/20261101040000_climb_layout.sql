-- The Mountain Climber skin's own layout (Steve, 2026-10-31): a rock wall with a climber
-- on a rope down its left edge. Added on its own so the next migration can use it.
alter type public.feed_layout add value if not exists 'climb';
