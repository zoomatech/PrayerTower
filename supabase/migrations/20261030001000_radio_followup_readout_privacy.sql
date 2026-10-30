-- Closing the loop for members, the spoken readout and name privacy on the air
-- (docs/STATION_OPERATOR_GUIDE.md: "Sent by radio", "Read aloud", "Privacy on the air").
-- Each is off until an admin turns it on.
--
-- radio_followup_enabled: the member who sent a radio prayer and the person who asked see
-- "Sent by radio at 9:30 PM, heard by 4 listeners" on the request, with a small map of the
-- listener nodes that heard it. Members who opt in (profiles.radio_followup_opt_in) get one
-- gentle notice per send, about half an hour after it went out (radio_prayers.followup_sent_at).
-- radio_read_aloud_enabled: the Listen screen offers to read decoded prayers aloud with the
-- device's own speech.
-- radio_name_privacy_enabled: for a member who chose privacy (an anonymous request, or
-- profiles.radio_names_private), names are taken out of the words before they go on the air.
alter table public.token_settings
  add column radio_followup_enabled boolean not null default false,
  add column radio_read_aloud_enabled boolean not null default false,
  add column radio_name_privacy_enabled boolean not null default false;

alter table public.profiles
  add column radio_followup_opt_in boolean not null default false,
  add column radio_names_private boolean not null default false;

alter table public.radio_prayers add column followup_sent_at timestamptz;

create index radio_prayers_followup_due_idx on public.radio_prayers (transmitted_at)
  where status = 'transmitted' and followup_sent_at is null;
