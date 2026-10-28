-- Messages can be reported and flagged like posts and comments.
-- Added alone because a new enum value can't be used in the transaction that adds it.
alter type public.moderation_target add value if not exists 'message';
