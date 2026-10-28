-- Prayer-to-prayee messages are moderated like comments; the enum value must
-- be committed before the messages migration uses it.
alter type public.moderation_target add value if not exists 'message';
