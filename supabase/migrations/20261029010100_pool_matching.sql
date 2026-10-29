-- Matching pledges on token pools (Ethel page 1, item 6: "seeding ... and would match
-- donations himself 2 to 1"). With the switch on, a donor can let other members give
-- to their pool and match each gift N to 1 from their own tokens, up to a cap.
-- Tokens only; no money. Off by default.
alter table public.notebook_settings
  add column pool_matching_enabled boolean not null default false;

alter table public.token_pools
  add column match_ratio smallint not null default 0 check (match_ratio between 0 and 5),
  add column match_cap integer not null default 0 check (match_cap between 0 and 1000000),
  add column matched integer not null default 0 check (matched >= 0 and matched <= match_cap);
