-- Urgent first (docs/RADIO_STATION.md, "Queue order"): while on, requests marked
-- "Today" or "Right now" (posts.urgency >= 2) go out before the rest of the
-- radio queue, whichever order the rest follows. Off by default.
alter table public.token_settings add column radio_urgent_first boolean not null default false;
