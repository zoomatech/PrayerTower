-- The prayer panel and SSTV (docs/RADIO_BURST.md, "Prayer panel"). Off by default.
--
-- radio_panel_enabled: a station with BURST_MODE=sstv may claim prayers and send them as a
-- prayer panel (a batch packed into one black-and-white picture) in SSTV Robot 36; members see
-- the latest panel to show on a screen or print; the listener apps offer to read a panel with
-- the camera and to decode SSTV pictures from the radio.
alter table public.token_settings add column radio_panel_enabled boolean not null default false;
