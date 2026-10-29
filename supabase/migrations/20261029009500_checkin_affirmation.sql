-- Concept doc, MVP step 3 ("Check in"): "By checking in, you are affirming before
-- God that you have truly prayed for this person." Off by default; when on, the
-- Promises tab shows that line beside each "I prayed" button.
alter table public.notebook_settings
  add column checkin_affirmation_enabled boolean not null default false;
