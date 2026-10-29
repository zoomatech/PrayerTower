-- "On the air" receipts (docs/RADIO_BURST.md, "Receipts"): when the station
-- reports a prayer sent, the member who sent it is told the time and preset;
-- when a listener's /listen page (or the app's Listen screen) decodes it, the
-- sender and the person who asked are told it was heard. Off until an admin
-- turns it on in Admin -> Radio.
alter table public.token_settings add column radio_receipts_enabled boolean not null default false;

alter table public.radio_prayers
  -- The burst preset the station used (null for PSK31 and the log transmitter).
  add column preset text,
  -- First 32 hex digits of SHA-256 of the exact text that went out, so a
  -- listener can say what it heard without sending the words back.
  add column sent_hash text check (sent_hash ~ '^[0-9a-f]{32}$'),
  add column heard_at timestamptz,
  add column heard_snr_db real,
  add column heard_count integer not null default 0 check (heard_count >= 0);

create index radio_prayers_sent_hash_idx on public.radio_prayers (sent_hash, transmitted_at desc) where sent_hash is not null;
