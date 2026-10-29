-- Golden Wood on parchment, like Tolkien's own pen-and-ink tree drawings (Steve's design note,
-- 2026-10-29). Only the backdrop changes; the leaf box still keeps the text at 4.5:1.
update public.feed_themes set tokens = tokens || '{"backdrop": "#F4ECD8"}'::jsonb where slug = 'golden-wood';
