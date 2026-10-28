-- Spoken prayers can be reported like messages. Added alone (new enum value).
alter type public.moderation_target add value if not exists 'spoken_prayer';
