-- Goldfish memory (docs/GENTLE_REPAIR.md), off: the moderation queue shows how many of the
-- author's posts were removed recently. Removals fade from that count after a set time, so an
-- old mistake isn't held against anyone; serious harms (harm, flooding, automated accounts)
-- never fade. Repeated removals inside the window tell the admins, quietly.
alter table public.moderation_tool_settings
  add column goldfish_enabled boolean not null default false,
  add column goldfish_days int not null default 90 check (goldfish_days between 14 and 365),
  add column goldfish_repeat int not null default 3 check (goldfish_repeat between 2 and 10);
create index moderation_items_user_decided_idx on public.moderation_items (user_id, decided_at) where status = 'actioned';
