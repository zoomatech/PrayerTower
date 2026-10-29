-- Comments at block breaks (notebook Page 13): a comment on one ~200-word part of a long
-- post. Shown with the other comments at the end, labeled with its part. Off by default.
alter table public.conversation_settings add column part_comments_enabled boolean not null default false;
alter table public.comments add column part smallint check (part >= 0);
