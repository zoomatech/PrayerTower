-- Common Prayer Fund public report (Business Plan: "a share of every token
-- purchase goes to the Common Prayer Fund"; Unbuilt Ideas Inventory).
-- The page stays behind future_settings.common_fund_page_enabled (off).
-- Admins record money in (a purchase share, a donation) and money out (help
-- the Witness team sent). The app moves no money: these are bookkeeping rows.
-- Token purchase isn't built, so 'purchase_share' rows are entered by hand
-- until it is. Rows are never deleted; a mistake is voided, and the report
-- leaves voided rows out.
create type public.common_fund_direction as enum ('in', 'out');

create table public.common_fund_entries (
  id uuid primary key default public.uuid_v7(),
  direction public.common_fund_direction not null,
  -- 'in': purchase_share | donation | other. 'out': help.
  source text not null check (source in ('purchase_share', 'donation', 'help', 'other')),
  amount_cents int not null check (amount_cents between 1 and 100000000),
  occurred_on date not null default current_date,
  -- For help sent: the Witness case and the kind of help ("groceries", "rent").
  witness_case_id uuid references public.witness_cases (id) on delete set null,
  help_kind text check (char_length(help_kind) <= 60),
  -- Shown on the public report. Never a name.
  public_note text check (char_length(public_note) <= 200),
  recorded_by uuid references public.profiles (id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((direction = 'out') = (source = 'help'))
);
create index common_fund_entries_on on public.common_fund_entries (occurred_on desc, id desc);
alter table public.common_fund_entries enable row level security;
