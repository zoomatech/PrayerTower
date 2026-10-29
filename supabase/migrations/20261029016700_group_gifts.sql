-- Gifts to a prayer group or a meet-up (Business Plan 6.2: "Tokens given to individuals,
-- causes, prayer groups or meet-ups"). Off by default. A member gives tokens to a group
-- chat they belong to, or to an event; the tokens are split evenly among the group's other
-- members or the event's "going" RSVPs, as ordinary gifts in the ledger.
alter table public.notebook_settings add column group_gifts_enabled boolean not null default false;
