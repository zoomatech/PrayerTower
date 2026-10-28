-- Communities admins create (Notes p16, "denomination sandboxes" and "leasing to
-- other religions"). Every new community starts hidden, so nothing changes for
-- members until an admin turns it on (Admin → Communities). Steve chose one
-- ecumenical feed for V1 (2026-10-25); this only makes more possible.
alter table public.communities
  add column description text check (description is null or char_length(description) <= 500),
  -- Who runs a leased community: a partner church, ministry or faith group. Null = run by Prayer Tower.
  add column operator_name text check (operator_name is null or char_length(operator_name) between 1 and 120),
  add column operator_contact text check (operator_contact is null or char_length(operator_contact) <= 200);

-- Wording members of a community read: 'faith' (Prayer Tower's) or 'neutral'
-- (Open Circle's, no religious words). Kept in vocabulary.wording; secular
-- communities are neutral even without it.
update public.communities set vocabulary = vocabulary || '{"wording": "neutral"}' where tradition = 'secular';
