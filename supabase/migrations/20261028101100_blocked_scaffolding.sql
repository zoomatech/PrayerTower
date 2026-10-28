-- Groundwork for features blocked on Steve, a lawyer or store accounts. Every
-- switch is off; nothing here takes money or calls an AI.
--
-- 1. Token purchase (notebook Page 12; Business Plan 6.3): needs the legal
--    entity, Apple/Google developer accounts and prices. Products are listed
--    here but stay inactive; purchases are refused while the switch is off.
-- 2. Common Prayer Fund (Business Plan 6.4): a share of every purchase, with
--    a public page. The percentage is a placeholder (the plan's 10%).
-- 3. AI conversation "with God" (Business Plan 3.8), with a persistent
--    warning that it is not God: needs Steve's go-ahead and an AI provider.

create table public.token_products (
  id uuid primary key default public.uuid_v7(),
  sku text not null unique check (sku ~ '^[a-z0-9_.]{3,100}$'),
  tokens int not null check (tokens > 0),
  -- Shown only; the store sets the real price.
  price_label text check (char_length(price_label) <= 30),
  apple_product_id text,
  google_product_id text,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.future_settings (
  id boolean primary key default true check (id),
  purchases_enabled boolean not null default false,
  common_fund_percent numeric not null default 10 check (common_fund_percent between 0 and 100),
  common_fund_page_enabled boolean not null default false,
  ai_chat_enabled boolean not null default false,
  ai_chat_warning text not null default 'This is an AI. It is not God, and it does not speak for God. Bring your prayers to God yourself, and talk with a pastor or prayer partner for guidance.'
);
insert into public.future_settings default values;

alter table public.token_products enable row level security;
alter table public.future_settings enable row level security;
