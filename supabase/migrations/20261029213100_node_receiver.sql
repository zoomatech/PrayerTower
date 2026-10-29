-- What a listener node listens with (apps/station/src/sdr.ts), sent with its heartbeat:
-- a radio on a sound card, or an RTL-SDR dongle with its frequency and mode. Shown in
-- Admin → Radio and on the coverage map; null until the node reports it.
-- Renamed from 20261029213000 (that version was taken twice); "if not exists" keeps it safe where it already ran.
alter table public.radio_nodes add column if not exists receiver jsonb;
