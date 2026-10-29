-- Emoji meanings in every card's single icon row, in every feed skin
-- (docs/CONVERSATION_HELPERS.md). Off by default; also needs Emoji meanings on.
alter table public.conversation_settings
  add column if not exists meaning_row_enabled boolean not null default false;

-- A members' kindness research page: the anonymous Counting patterns totals as simple
-- charts, with the same fold of rows under five. Off by default.
alter table public.conversation_settings
  add column if not exists research_page_enabled boolean not null default false;
