-- Share a passage, and a daily passage card in the feed (both off by default, and only
-- while text search itself is on). Sharing puts a search result into a new post with its
-- citation; the daily card shows one passage a day from a collection the member's
-- community is offered (the King James Bible, or the ancient writings in Open Circle).
alter table public.library_settings add column share_enabled boolean not null default false;
alter table public.library_settings add column daily_enabled boolean not null default false;
