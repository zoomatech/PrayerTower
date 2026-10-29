-- Admin → Safety dashboard: held posts, response times, on-call gaps, restores. Off by default.
alter table public.moderator_care_settings add column safety_dashboard_enabled boolean not null default false;
