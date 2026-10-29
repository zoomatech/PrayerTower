-- The public "Prayers on the air" page (/on-the-air): counts of what the
-- station sent, never content. Off until an admin turns it on in Admin -> Radio.
alter table public.token_settings add column on_air_page_enabled boolean not null default false;
