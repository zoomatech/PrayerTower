-- The member's app language, so notifications and pushes can be sent in it (docs/LOCALIZATION.md).
alter table public.profiles add column if not exists locale text not null default 'en' check (locale in ('en', 'es'));
