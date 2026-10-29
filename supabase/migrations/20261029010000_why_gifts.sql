-- "Why we run on gifts, not ads": the website's /why-donations page and the app's
-- screen on Me (copy: docs/copy/DONATIONS_NOT_ADS.md). Off by default.
alter table public.notebook_settings
  add column why_gifts_enabled boolean not null default false;
