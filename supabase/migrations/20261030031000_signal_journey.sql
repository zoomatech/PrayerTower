-- Signal journey (docs/STATION_OPERATOR_GUIDE.md, "Signal journey"), from the HAM Operators
-- notebook page ("the line of the radio waves journey through space") and the
-- radio-tower dashboard idea ("signal strength, frequency and light-years
-- reached"): on My signal queue, each radio prayer that went out shows how far
-- its wave has travelled since, the landmarks it has passed, and the strongest
-- report a receiver sent. Off until an admin turns it on.
alter table public.token_settings add column signal_journey_enabled boolean not null default false;
