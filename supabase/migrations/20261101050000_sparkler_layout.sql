-- The Full Screen Sparkler skin's own layout (Steve, 2026-11-01): full-width posts with no
-- border, a line down the left that grows as you scroll with a sparkler at its tip. Added on
-- its own so the next migration can use it.
alter type public.feed_layout add value if not exists 'sparkler';
