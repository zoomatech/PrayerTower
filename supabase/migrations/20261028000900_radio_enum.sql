-- Enum value for spending Priestly tokens on radio prayers (kept apart from
-- the migration that uses it; see 20261027000900).
alter type public.token_transfer_kind add value 'spend_radio';
