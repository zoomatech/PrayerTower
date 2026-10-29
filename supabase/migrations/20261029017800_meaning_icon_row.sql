-- Emoji meanings in every card's single icon row, in every feed skin
-- (docs/CONVERSATION_HELPERS.md). Off by default; also needs Emoji meanings on.
alter table public.conversation_settings
  add column if not exists meaning_row_enabled boolean not null default false;
