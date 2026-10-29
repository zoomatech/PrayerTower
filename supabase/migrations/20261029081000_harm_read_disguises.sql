-- The harmful-prayer check can also read through disguises (k1ll, unalive, emoji);
-- off by default (docs/HARMFUL_PRAYERS.md, "Disguised words").
alter table public.harm_settings add column read_disguises boolean not null default false;
