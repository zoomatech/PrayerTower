-- Harmful-prayer items (docs/HARMFUL_PRAYERS.md): requests for someone's harm,
-- curses, revenge, threats, hate, abuse disclosures.
-- Added alone because a new enum value can't be used in the transaction that adds it.
alter type public.moderation_source add value if not exists 'harm';
