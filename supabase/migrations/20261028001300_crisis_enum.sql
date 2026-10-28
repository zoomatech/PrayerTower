-- Crisis support items: posts or comments that mention suicide or self-harm.
-- Added alone because a new enum value can't be used in the transaction that adds it.
alter type public.moderation_source add value if not exists 'crisis';
