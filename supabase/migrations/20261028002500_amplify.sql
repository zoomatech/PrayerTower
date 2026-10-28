-- Amplify (notebook Page 10; "1,000x" decided). A PSK31 station sends about
-- one 280-character prayer a minute, so 1,000 sends a second is not possible
-- on amateur radio; until Steve decides how to reconcile it (roadmap open
-- question 1), Amplify sends the prayer a set number of times (admin setting,
-- placeholder 3) and is free only, because 47 CFR 97.113 bars tying an
-- amateur transmission to payment.
alter table public.token_settings
  add column radio_amplify_repeats int not null default 3 check (radio_amplify_repeats between 2 and 50);
alter table public.radio_prayers
  add column repeats int not null default 1 check (repeats between 1 and 50);
