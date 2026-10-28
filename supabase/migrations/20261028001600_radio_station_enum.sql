-- A radio station (Pi or laptop running fldigi) has claimed the prayer and is sending it.
alter type public.radio_prayer_status add value if not exists 'sending' after 'queued';
