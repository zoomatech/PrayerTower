-- Tier upkeep (Notes Page 3: "statuses must be maintained by using credits"), off until an admin
-- turns it on (Admin → Notebook ideas). While on, a member above the first tier who has not given
-- or spent a token in the last tier_upkeep_days days shows, and is resupplied at, one tier lower
-- until they give or spend one again. Earned prayers are never taken away.
alter table public.notebook_settings
  add column tier_upkeep_enabled boolean not null default false,
  add column tier_upkeep_days int not null default 30 check (tier_upkeep_days between 1 and 365);
