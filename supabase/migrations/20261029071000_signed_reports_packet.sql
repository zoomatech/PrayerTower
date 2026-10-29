-- Signed listener reports (docs/STATION_OPERATOR_GUIDE.md, "Signed listener
-- reports"). A listener node can sign each request with an HMAC instead of
-- sending its key: the key never crosses the network, and a captured request
-- can't be replayed (each signature's timestamp must be newer than the last).
-- node_signatures_required (off by default) refuses unsigned node requests.
alter table public.token_settings add column node_signatures_required boolean not null default false;
alter table public.radio_nodes add column last_signed_ms bigint;

-- Packet fallback (docs/RADIO_BURST.md, "Packet fallback"): a station with
-- BURST_MODE=packet sends only each prayer's short ID and the count, as APRS
-- status packets in 1200-baud AFSK. Off by default: its claims are refused.
alter table public.token_settings add column radio_packet_enabled boolean not null default false;
