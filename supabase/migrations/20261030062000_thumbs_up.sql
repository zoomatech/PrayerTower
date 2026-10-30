-- Thumbs up (Steve, 2026-10-30): the leftmost icon on every post, "the most used icon".
-- One per member per post, kept with the quick reactions; always on, unlike the long-press tray.
alter table public.quick_reactions drop constraint quick_reactions_kind_check;
alter table public.quick_reactions add constraint quick_reactions_kind_check check (kind in ('candle', 'standing', 'thumbs_up'));
