-- Stripe refunds and failed bank transfers. A gift that never cleared is
-- 'failed' (it used to be marked 'refunded'). A refunded gift takes back the
-- giver's thank-you tokens when they are still there.
alter table public.donations drop constraint donations_status_check;
alter table public.donations add constraint donations_status_check check (status in ('pending', 'paid', 'refunded', 'failed'));
update public.donations set status = 'failed' where status = 'refunded' and paid_at is null;
alter table public.donations
  add column provider_payment text,
  add column giver_transfer_id uuid references public.token_transfers (id) on delete set null,
  add column refunded_at timestamptz;
create unique index donations_provider_payment on public.donations (provider, provider_payment) where provider_payment is not null;
create index donations_giver_transfer on public.donations (giver_transfer_id);
