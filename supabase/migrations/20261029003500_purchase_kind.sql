-- Token purchase (App Store in-app purchase): its own ledger kind, added alone
-- because a new enum value can't be used in the transaction that adds it.
alter type public.token_transfer_kind add value if not exists 'purchase';
