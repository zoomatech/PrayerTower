-- Switch for how radio prayers are funded. 'tokens' (default): sending one
-- spends radio_prayer_cost Priestly tokens. 'free': sending costs nothing and
-- Priestly tokens are donations only, for transmitters (such as amateur radio,
-- 47 CFR 97.113) that must not be tied to payment.
alter table public.token_settings
  add column radio_funding text not null default 'tokens' check (radio_funding in ('tokens', 'free'));

alter table public.radio_prayers
  alter column transfer_id drop not null,
  add column idempotency_key text,
  drop constraint radio_prayers_cost_check,
  add constraint radio_prayers_cost_check check (cost >= 0),
  add constraint radio_prayers_paid_has_transfer check ((cost > 0) = (transfer_id is not null));
update public.radio_prayers set idempotency_key = id::text where idempotency_key is null;
alter table public.radio_prayers alter column idempotency_key set not null;
create unique index radio_prayers_idempotency_uq on public.radio_prayers (user_id, idempotency_key);
-- Free sends: at most one per member per request.
create unique index radio_prayers_free_once_uq on public.radio_prayers (user_id, post_id) where cost = 0;
