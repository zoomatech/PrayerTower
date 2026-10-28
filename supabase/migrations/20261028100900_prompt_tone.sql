-- Reminder tone (notebook Page 14 question: would firmer messaging, like
-- "Remember, you made a commitment before God to pray for Billy", work
-- better?). Gentle by default. A member can choose; otherwise the admin
-- default applies. Each prompt records its tone so the two can be compared.
create type public.prompt_tone as enum ('gentle', 'firm');

create table public.prompt_settings (
  id boolean primary key default true check (id),
  default_tone public.prompt_tone not null default 'gentle'
);
insert into public.prompt_settings default values;
alter table public.prompt_settings enable row level security;

alter table public.profiles add column prompt_tone public.prompt_tone;
alter table public.prayer_prompts add column tone public.prompt_tone not null default 'gentle';
