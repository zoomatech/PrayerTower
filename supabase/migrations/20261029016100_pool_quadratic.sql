-- Quadratic-style matching for token pools (research/Contributing_Without_Ad_Money.md,
-- suggestion 4): the match grows with how many people give, not how much one gives.
-- Uses the matching-pledges switch (pool_matching_enabled).
alter table public.token_pools
  add column match_mode text not null default 'ratio' check (match_mode in ('ratio', 'quadratic'));
