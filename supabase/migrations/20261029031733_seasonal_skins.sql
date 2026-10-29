-- Feed skin "Advent Wreath" (vine, advent), from a skin file. docs/CLAUDE_DESIGN_SKINS.md.
insert into public.feed_themes (slug, name, layout, status, gated, season, animations, tokens) values
  ('advent-wreath', 'Advent Wreath', 'vine', 'beta', true, 'advent', '{"enter":"grow","answered":"bloom","idleBird":false}', '{"backdrop":"#F6F2FB","stem":"#2F5D3A","branch":"#3E7A4C","leaf":"#7B5BA6","leafSoft":"#EFE8F7","tendril":"#5B3E96","stemWidth":7,"leafShape":"pointed","leafEvery":4,"tipText":"You have reached the top of the wreath. Keep watch, and come back soon."}')
on conflict (slug) do nothing;
insert into public.community_feed_themes (community_id, theme_id, is_default)
select c.id, t.id, false from public.communities c, public.feed_themes t where t.slug = 'advent-wreath' and c.slug <> 'open-circle'
on conflict do nothing;

-- Feed skin "Christmas Star" (vine, christmas), from a skin file. docs/CLAUDE_DESIGN_SKINS.md.
insert into public.feed_themes (slug, name, layout, status, gated, season, animations, tokens) values
  ('christmas-star', 'Christmas Star', 'vine', 'beta', true, 'christmas', '{"enter":"blossom","answered":"bloom","idleBird":false}', '{"backdrop":"#0D1B36","stem":"#E8C15A","branch":"#E8C15A","leaf":"#FFF4C2","leafSoft":"#FFF8E1","tendril":"#FFD36E","stemWidth":3,"stemGlow":true,"leafShape":"star","leafEvery":4,"tipText":"You have followed the star to the top. Come back soon."}')
on conflict (slug) do nothing;
insert into public.community_feed_themes (community_id, theme_id, is_default)
select c.id, t.id, false from public.communities c, public.feed_themes t where t.slug = 'christmas-star' and c.slug <> 'open-circle'
on conflict do nothing;

-- Feed skin "Lenten Desert" (vine, lent), from a skin file. docs/CLAUDE_DESIGN_SKINS.md.
insert into public.feed_themes (slug, name, layout, status, gated, season, animations, tokens) values
  ('lenten-desert', 'Lenten Desert', 'vine', 'beta', true, 'lent', '{"enter":"grow","answered":"bloom","idleBird":false}', '{"backdrop":"#F8F3EA","stem":"#8A6E4B","branch":"#A0845C","leaf":"#8E6FB0","leafSoft":"#F1EBF5","tendril":"#5E4380","stemWidth":4,"leafShape":"pointed","leafEvery":4,"tipText":"You have reached the end of the desert path. Rest a while, and come back later."}')
on conflict (slug) do nothing;
insert into public.community_feed_themes (community_id, theme_id, is_default)
select c.id, t.id, false from public.communities c, public.feed_themes t where t.slug = 'lenten-desert' and c.slug <> 'open-circle'
on conflict do nothing;

-- Feed skin "Easter Lily" (vine, easter), from a skin file. docs/CLAUDE_DESIGN_SKINS.md.
insert into public.feed_themes (slug, name, layout, status, gated, season, animations, tokens) values
  ('easter-lily', 'Easter Lily', 'vine', 'beta', true, 'easter', '{"enter":"blossom","answered":"bloom","idleBird":true}', '{"backdrop":"#FFFDF4","stem":"#5E8C3A","branch":"#7DA453","leaf":"#F2D46B","leafSoft":"#FFF8DC","tendril":"#8A6A00","stemWidth":5,"leafShape":"flower","leafEvery":4,"tipText":"You have reached the top of the garden. He is risen; come back soon to see what blooms."}')
on conflict (slug) do nothing;
insert into public.community_feed_themes (community_id, theme_id, is_default)
select c.id, t.id, false from public.communities c, public.feed_themes t where t.slug = 'easter-lily' and c.slug <> 'open-circle'
on conflict do nothing;

-- Feed skin "Pentecost Flame" (vine, pentecost), from a skin file. docs/CLAUDE_DESIGN_SKINS.md.
insert into public.feed_themes (slug, name, layout, status, gated, season, animations, tokens) values
  ('pentecost-flame', 'Pentecost Flame', 'vine', 'beta', true, 'pentecost', '{"enter":"blossom","answered":"bloom","idleBird":false}', '{"backdrop":"#2A0B0B","stem":"#FF6A3D","branch":"#FFB347","leaf":"#FFB347","leafSoft":"#FFF1E6","tendril":"#FFC27A","stemWidth":3,"stemGlow":true,"leafShape":"star","leafEvery":4,"tipText":"You have reached the top of the flame. Come back soon."}')
on conflict (slug) do nothing;
insert into public.community_feed_themes (community_id, theme_id, is_default)
select c.id, t.id, false from public.communities c, public.feed_themes t where t.slug = 'pentecost-flame' and c.slug <> 'open-circle'
on conflict do nothing;

-- Feed skin "Winter Frost" (vine, winter), from a skin file. docs/CLAUDE_DESIGN_SKINS.md.
insert into public.feed_themes (slug, name, layout, status, gated, season, animations, tokens) values
  ('winter-frost', 'Winter Frost', 'vine', 'beta', true, 'winter', '{"enter":"grow","answered":"bloom","idleBird":false}', '{"backdrop":"#EEF4FA","stem":"#9FB6CC","branch":"#7F9AB5","leaf":"#BFD7EA","leafSoft":"#F2F7FB","tendril":"#2F5677","stemWidth":3,"stemDouble":true,"leafShape":"star","leafEvery":4,"tipText":"You have reached the top of the frost. Come back later."}')
on conflict (slug) do nothing;
insert into public.community_feed_themes (community_id, theme_id, is_default)
select c.id, t.id, false from public.communities c, public.feed_themes t where t.slug = 'winter-frost' and c.slug = 'open-circle'
on conflict do nothing;

-- Feed skin "Spring Bloom" (vine, spring), from a skin file. docs/CLAUDE_DESIGN_SKINS.md.
insert into public.feed_themes (slug, name, layout, status, gated, season, animations, tokens) values
  ('spring-bloom', 'Spring Bloom', 'vine', 'beta', true, 'spring', '{"enter":"blossom","answered":"bloom","idleBird":true}', '{"backdrop":"#F5FBF2","stem":"#5E9A4A","branch":"#7DB36A","leaf":"#F7A8C4","leafSoft":"#FFF0F5","tendril":"#B0245C","stemWidth":5,"leafShape":"flower","leafEvery":4,"tipText":"You have reached the end of the spring path. Come back later to see what blooms."}')
on conflict (slug) do nothing;
insert into public.community_feed_themes (community_id, theme_id, is_default)
select c.id, t.id, false from public.communities c, public.feed_themes t where t.slug = 'spring-bloom' and c.slug = 'open-circle'
on conflict do nothing;

-- Feed skin "Summer Sun" (vine, summer), from a skin file. docs/CLAUDE_DESIGN_SKINS.md.
insert into public.feed_themes (slug, name, layout, status, gated, season, animations, tokens) values
  ('summer-sun', 'Summer Sun', 'vine', 'beta', true, 'summer', '{"enter":"grow","answered":"bloom","idleBird":true}', '{"backdrop":"#FFFAEB","stem":"#4F8A2E","branch":"#6B8E23","leaf":"#F4C430","leafSoft":"#FFF6D5","tendril":"#8A5A00","stemWidth":8,"leafShape":"round","leafEvery":4,"tipText":"You have reached the top of the sunflower. Come back later."}')
on conflict (slug) do nothing;
insert into public.community_feed_themes (community_id, theme_id, is_default)
select c.id, t.id, false from public.communities c, public.feed_themes t where t.slug = 'summer-sun' and c.slug = 'open-circle'
on conflict do nothing;

-- Feed skin "Autumn Leaves" (vine, autumn), from a skin file. docs/CLAUDE_DESIGN_SKINS.md.
insert into public.feed_themes (slug, name, layout, status, gated, season, animations, tokens) values
  ('autumn-leaves', 'Autumn Leaves', 'vine', 'beta', true, 'autumn', '{"enter":"grow","answered":"bloom","idleBird":true}', '{"backdrop":"#FFF7EE","stem":"#7A4E2D","branch":"#93603A","leaf":"#E07B39","leafSoft":"#FDF0E4","tendril":"#A0401A","stemWidth":6,"leafShape":"pointed","leafEvery":4,"tipText":"You have reached the top of the tree. Come back later as the leaves turn."}')
on conflict (slug) do nothing;
insert into public.community_feed_themes (community_id, theme_id, is_default)
select c.id, t.id, false from public.communities c, public.feed_themes t where t.slug = 'autumn-leaves' and c.slug = 'open-circle'
on conflict do nothing;
