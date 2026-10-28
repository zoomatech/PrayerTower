-- Confession with clergy (notebook Page 2), finished behind its existing switch
-- (care_settings.confession_enabled, off by default). Confessions are answered
-- only by pastors and counselors, never by prayer partners, and are erased a set
-- number of days after they are closed: the conversation and its messages are
-- deleted and the request keeps no text. 0 erases them as soon as they close.
alter table public.care_settings
  add column confession_retention_days int not null default 7 check (confession_retention_days between 0 and 3650);
