-- General groups (Steve, 2026-10-31): open group chats anyone can find and join, starting with
-- "Cancer survivors". A group Prayer Tower starts has no member as its creator, so created_by
-- may be empty for groups (a member's group still records who started it).
alter table public.conversations alter column created_by drop not null;
alter table public.conversations add constraint conversations_creator_check check (created_by is not null or kind = 'group');

insert into public.conversations (kind, community_id, created_by, title, topic, is_public)
select 'group', public.default_community_id(), null, 'Cancer survivors', 'For cancer survivors to pray for, encourage and get to know one another.', true
 where not exists (select 1 from public.conversations where kind = 'group' and title = 'Cancer survivors' and created_by is null);
