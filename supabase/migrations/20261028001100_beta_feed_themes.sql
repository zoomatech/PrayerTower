-- Two beta feed styles members can opt into. The community default stays the
-- Classic column; a member's choice is community_memberships.feed_theme_id.
insert into public.feed_themes (slug, name, layout, status, animations) values
  ('vine', 'Vine', 'vine', 'beta', '{"enter": "blossom", "answered": "bloom"}'),
  ('flip', 'Flip', 'flip', 'beta', '{"enter": "page-turn"}');
insert into public.community_feed_themes (community_id, theme_id, is_default)
select public.default_community_id(), id, false from public.feed_themes where slug in ('vine', 'flip');
