-- "My signal queue" (docs/STATION_OPERATOR_GUIDE.md, "My signal queue"), from
-- the first prototype's Signal Queue tab: a member's own radio prayers, each
-- with its status and a signal code made from the fingerprint of the text that
-- went out, which a listener decoding it sees too. Off until an admin turns on
-- signal_queue_enabled.
alter table public.token_settings add column signal_queue_enabled boolean not null default false;
