-- Amplify paid with Priestly tokens (Notes p15: "1000x/sec for a set number of
-- seconds"). Off by default (null). While radio prayers cost tokens, Amplify was
-- refused; with a cost set here an admin allows it at that price. Whether a
-- paid transmission is allowed on the air is for the licensing/legal side to
-- decide (docs/RADIO_STATION.md); this only makes it switchable.
alter table public.token_settings
  add column amplify_paid_cost int check (amplify_paid_cost between 1 and 1000);
