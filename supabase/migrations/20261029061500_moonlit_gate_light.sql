-- Moonlit Gate in lines of silver light on a night sky, under a drawn gate
-- (vineStyle 'gate'). See docs/FEED_SKINS.md.
update public.feed_themes
   set tokens = tokens || '{"vineStyle": "gate", "backdrop": "#0B1324", "stem": "#CFE0F5", "leaf": "#E6EEF9", "leafSoft": "#EEF3FA", "tendril": "#9FC3E8", "branch": "#8FA6BD", "stemWidth": 2, "stemDouble": false}'::jsonb
 where slug = 'moonlit-gate';
