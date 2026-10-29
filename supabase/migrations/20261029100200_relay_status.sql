-- Store-and-forward relays (docs/RADIO_BURST.md) report with their heartbeat:
-- frames re-sent and air time in the last hour, and frames skipped by reason.
-- The operator console shows it under "Relays".
alter table public.radio_nodes
  add column relay_status jsonb,
  add column relay_reported_at timestamptz;
