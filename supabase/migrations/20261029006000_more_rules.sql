-- Two more community rules from the notebook (Project Management Document 6.3:
-- "better ways to handle misinformation" and "handling AI agents"), each off
-- until an admin turns it on (Admin → Notebook ideas). While off, the rule is
-- not shown and moderators can't cite it.
alter table public.notebook_settings
  add column misleading_rule_enabled boolean not null default false,
  add column automation_rule_enabled boolean not null default false;
