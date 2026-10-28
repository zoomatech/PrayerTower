-- Events can be reported and flagged like posts. Added alone (new enum value).
alter type public.moderation_target add value if not exists 'event';
