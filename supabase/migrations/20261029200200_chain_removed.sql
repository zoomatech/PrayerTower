-- Removing someone from a prayer chain hides the row instead of deleting it, so that
-- re-adding them never sends a second invitation, and someone who said no (or
-- replied STOP) is never asked again. Removed rows that never said no are erased
-- by the daily growth purge after 30 days.
alter table public.prayer_chain_members add column removed_at timestamptz;
