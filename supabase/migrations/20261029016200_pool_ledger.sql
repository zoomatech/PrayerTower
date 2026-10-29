-- Public pool ledger (research/Contributing_Without_Ad_Money.md, suggestion 8): members
-- see, in aggregate for their community, what went into token pools and what it did.
-- Names no one. Off by default.
alter table public.notebook_settings add column pool_ledger_enabled boolean not null default false;
