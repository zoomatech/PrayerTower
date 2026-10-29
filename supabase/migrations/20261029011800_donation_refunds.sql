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

-- PayPal (Steve 2026-10-29: "how can we take paypal donations?"). Stripe offers
-- PayPal only to businesses in Europe, so the app opens PayPal's own Donate link
-- as a second way to give, beside Stripe or Zeffy. Admins record those gifts.
alter table public.donation_settings
  add column paypal_url text check (paypal_url is null or paypal_url like 'https://%');
alter table public.donations drop constraint donations_provider_check;
alter table public.donations add constraint donations_provider_check check (provider in ('stripe', 'zeffy', 'paypal', 'manual'));

-- Zeffy gifts recorded automatically from Zeffy's API (Steve 2026-10-29: "if
-- we can we should go with Zeffy"). Zeffy doesn't say yet whether amounts are
-- cents or dollars, so it's a setting.
alter table public.donation_settings
  add column zeffy_amount_unit text not null default 'cents' check (zeffy_amount_unit in ('cents', 'dollars'));
