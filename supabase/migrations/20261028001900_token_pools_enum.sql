-- New enum values must be committed before use (see 20261028002000_token_pools).
alter type public.token_account_kind add value 'pool';
alter type public.token_transfer_kind add value 'pool_fund';
alter type public.token_transfer_kind add value 'pool_draw';
alter type public.token_transfer_kind add value 'pool_return';
