-- LIVE AMPLIFIER (notebook, HAM Operators page): "a tier of prayer warrior ...
-- instead of a digitally encoded message, they promise to read prayers out
-- loud over their HAM radio setup."
-- Off by default. An admin adds a licensed operator by call sign after checking
-- the licence. Operators claim a prayer that a member chose to send by radio,
-- read it on the air, and mark it read. The text never carries a name.
-- 47 CFR 97.113 bars transmitting for payment, so by default the queue is open
-- only while radio prayers are free (token_settings.radio_funding = 'free').
create table public.live_amplifier_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  require_free boolean not null default true,
  -- A claim nobody marks read goes back to the queue after this long.
  claim_minutes int not null default 60 check (claim_minutes between 5 and 1440),
  max_open_claims int not null default 3 check (max_open_claims between 1 and 50),
  -- How far back the queue looks for radio prayers.
  window_days int not null default 14 check (window_days between 1 and 365),
  -- How many operators may read the same prayer.
  reads_per_prayer int not null default 1 check (reads_per_prayer between 1 and 20)
);
insert into public.live_amplifier_settings default values;
alter table public.live_amplifier_settings enable row level security;

create table public.live_amplifier_operators (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  call_sign text not null unique check (call_sign ~ '^[A-Z0-9]{1,3}[0-9][A-Z0-9]{0,3}[A-Z](/[A-Z0-9]{1,4})?$'),
  license_class text check (char_length(license_class) <= 30),
  active boolean not null default true,
  verified_by uuid references public.profiles (id) on delete set null,
  verified_at timestamptz not null default now()
);
alter table public.live_amplifier_operators enable row level security;

create type public.live_reading_status as enum ('claimed', 'read', 'released');

create table public.live_amplifier_readings (
  id uuid primary key default public.uuid_v7(),
  radio_prayer_id uuid not null references public.radio_prayers (id) on delete cascade,
  operator_id uuid not null references public.live_amplifier_operators (user_id) on delete cascade,
  call_sign text not null,
  status public.live_reading_status not null default 'claimed',
  -- Optional, from the operator: "40 m net", "146.52 simplex".
  on_air_note text check (char_length(on_air_note) <= 100),
  claimed_at timestamptz not null default now(),
  read_at timestamptz,
  unique (radio_prayer_id, operator_id)
);
create index live_amplifier_readings_open on public.live_amplifier_readings (operator_id) where status = 'claimed';
alter table public.live_amplifier_readings enable row level security;
