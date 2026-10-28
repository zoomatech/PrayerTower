-- Enum values for Priestly tokens. Kept apart from the migration that uses
-- them, because Postgres cannot use a new enum value in the transaction that
-- adds it.

create type public.token_currency as enum (
  'regular',  -- earned by praying; spent on reach or gifted
  'priestly'  -- earned by sustained, verified prayer; funds the intercessory infrastructure
);

alter type public.token_account_kind add value 'infrastructure'; -- sink for donated Priestly tokens
alter type public.token_transfer_kind add value 'donate';
alter type public.token_transfer_kind add value 'bonus';          -- reserved for milestone bonuses
