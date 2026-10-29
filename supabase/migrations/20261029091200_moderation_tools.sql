-- Moderation dashboard tools (2026-10-29), one switch, off: search the queue and
-- past decisions, decide several reports at once, and filter the staff audit log.
-- Someone who may be in danger is never part of a bulk decision.
create table public.moderation_tool_settings (
  id boolean primary key default true check (id),
  tools_enabled boolean not null default false,
  -- Most items one bulk decision may cover.
  bulk_max int not null default 25 check (bulk_max between 2 and 100)
);
insert into public.moderation_tool_settings default values;
alter table public.moderation_tool_settings enable row level security;

-- Paging back through past decisions.
create index moderation_items_decided_idx on public.moderation_items (decided_at desc) where status <> 'pending';
