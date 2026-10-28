-- Token purchase through the App Store (notebook Page 12; Business Plan 6.3).
-- Still behind future_settings.purchases_enabled (off). The app buys a
-- consumable with StoreKit 2 and sends its signed transaction; the server
-- checks Apple's signature (App Store Server Library) before crediting tokens,
-- once per transaction. A refund from Apple (App Store Server Notifications V2)
-- takes the tokens back.
alter table public.token_products
  add column currency public.token_currency not null default 'regular';

create type public.token_purchase_status as enum ('credited', 'refunded');

create table public.token_purchases (
  id uuid primary key default public.uuid_v7(),
  user_id uuid references public.profiles (id) on delete set null,
  platform text not null default 'ios' check (platform in ('ios', 'android')),
  product_id uuid references public.token_products (id) on delete set null,
  store_product_id text not null,
  -- Apple's transactionId: one credit per transaction.
  transaction_id text not null,
  original_transaction_id text,
  environment text not null,
  tokens int not null check (tokens > 0),
  currency public.token_currency not null,
  -- From the store: price in milliunits (990 = 0.99) and ISO 4217 currency.
  price_milli bigint,
  price_currency text,
  transfer_id uuid not null references public.token_transfers (id),
  status public.token_purchase_status not null default 'credited',
  refund_transfer_id uuid references public.token_transfers (id),
  refund_note text check (char_length(refund_note) <= 200),
  fund_entry_id uuid references public.common_fund_entries (id) on delete set null,
  purchased_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (platform, transaction_id)
);
create index token_purchases_user on public.token_purchases (user_id, created_at desc);
alter table public.token_purchases enable row level security;

-- Each App Store Server Notification is handled once.
create table public.store_notifications (
  notification_uuid text primary key,
  notification_type text not null,
  subtype text,
  received_at timestamptz not null default now()
);
alter table public.store_notifications enable row level security;
