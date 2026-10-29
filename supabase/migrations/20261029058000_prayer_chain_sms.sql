-- Prayer chain by text message (roadmap/Growth_Ideas_Big_Platforms_Missed.md, idea 2:
-- "SMS needs a paid provider, so it goes last"). A chain entry is an email address or a
-- mobile number. A number gets one text asking to join, and nothing else until it says
-- yes on the web page. Off until Admin → Growth turns it on, and silent until the server
-- has a text message provider (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM).
alter table public.growth_settings add column prayer_chain_sms_enabled boolean not null default false;

alter table public.prayer_chain_members
  alter column email drop not null,
  -- E.164: +, country code, number.
  add column phone text check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  add constraint prayer_chain_members_one_address check (num_nonnulls(email, phone) = 1),
  add constraint prayer_chain_members_owner_phone_key unique (owner_id, phone);
