-- Who can reply: the person who asked chooses who may comment on their post: everyone
-- (the default), only people who prayed or supported, or no comments at all (prayers only).
-- Off by default; while off, everyone can comment as before.
alter table public.conversation_settings add column reply_choice_enabled boolean not null default false;
alter table public.posts add column reply_audience text not null default 'everyone' check (reply_audience in ('everyone', 'supporters', 'none'));
