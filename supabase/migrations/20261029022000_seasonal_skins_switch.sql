-- Seasonal feed skins (docs/FEED_SKINS.md, Seasonal skins). A skin with a season is
-- offered only during that season (Advent, Christmas, Lent, Easter, Pentecost for
-- faith communities; winter, spring, summer, autumn for Open Circle), and only while
-- Admin → Feed skins → Seasonal skins is on. With "Use the season's skin for members
-- who haven't chosen one" also on, members on the community default see it by date.
alter table public.feed_themes
  add column season text check (season in ('advent', 'christmas', 'lent', 'easter', 'pentecost', 'winter', 'spring', 'summer', 'autumn'));
alter table public.skin_settings
  add column seasonal_enabled boolean not null default false,
  add column seasonal_auto boolean not null default false;
