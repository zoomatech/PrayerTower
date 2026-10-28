-- In-app account deletion (App Store Review Guideline 5.1.1(v)).
-- The token ledger is append-only and its accounts point at profiles, so a
-- deleted member's profile stays as an anonymous tombstone ("Deleted member")
-- while the sign-in record in auth.users is removed. That means profiles can
-- no longer cascade from auth.users.
alter table public.profiles drop constraint profiles_id_fkey;
alter table public.profiles add column deleted_at timestamptz;
