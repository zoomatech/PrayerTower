-- An optional outside support link on profiles (research/Contributing_Without_Ad_Money.md,
-- suggestion 7): a member can link their own Ko-fi, Patreon or similar page, so money
-- stays outside the community. Only listed sites are allowed. Off by default.
alter table public.notebook_settings add column support_links_enabled boolean not null default false;
alter table public.profiles add column support_url text check (char_length(support_url) <= 200);
