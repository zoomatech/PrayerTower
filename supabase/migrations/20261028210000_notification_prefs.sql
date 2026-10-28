-- Notification settings: push on/off per category and quiet hours (packages/shared NotificationPrefs).
alter table public.profiles
  add column if not exists notification_prefs jsonb not null default '{"off": [], "quietHours": null}'::jsonb;
