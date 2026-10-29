-- Amplify up to 1,000 times (notebook p15: "1,000x/second"). In burst mode the
-- copies compress to almost nothing, so 1,000 copies of a prayer go out in
-- about half a second (docs/RADIO_BURST.md). A PSK31 station still sends at most
-- 50 copies. The setting stays at 3 until an admin picks more.
alter table public.token_settings drop constraint token_settings_radio_amplify_repeats_check;
alter table public.token_settings add constraint token_settings_radio_amplify_repeats_check check (radio_amplify_repeats between 2 and 1000);
alter table public.radio_prayers drop constraint radio_prayers_repeats_check;
alter table public.radio_prayers add constraint radio_prayers_repeats_check check (repeats between 1 and 1000);
