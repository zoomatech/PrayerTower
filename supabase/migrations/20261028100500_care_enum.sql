-- Care conversations: a member and a prayer partner or pastor. Added alone (new enum value).
alter type public.conversation_kind add value if not exists 'care';
