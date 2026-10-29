-- What a listener node listens with (apps/station/src/sdr.ts), sent with its heartbeat:
-- a radio on a sound card, or an RTL-SDR dongle with its frequency and mode. Shown in
-- Admin → Radio and on the coverage map; null until the node reports it.
alter table public.radio_nodes add column receiver jsonb;
