-- Radio station mode (Queue-to-PSK31 build paper). With radio_transmitter =
-- 'station', queued radio prayers wait for the station worker to claim them
-- over the API; 'log' keeps the placeholder transmitter. Amateur rules
-- (47 CFR 97.113(a)(2)-(3)) forbid tying a transmission to payment, so by
-- default the station only receives prayers while radio_funding = 'free'.

alter table public.token_settings
  add column radio_transmitter text not null default 'log' check (radio_transmitter in ('log', 'station')),
  add column radio_station_requires_free boolean not null default true,
  -- Longest request text handed to the station; the station splits it into pieces that each end with the call sign.
  add column radio_max_chars int not null default 1000 check (radio_max_chars between 50 and 2800);

alter table public.radio_prayers
  add column claimed_at timestamptz,
  add column call_sign text check (char_length(call_sign) <= 20),
  add column pieces int check (pieces > 0);
