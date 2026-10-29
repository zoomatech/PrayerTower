-- The browser listening page (/listen): decodes radio bursts from a phone or
-- laptop microphone (docs/RADIO_BURST.md, "Listen in a browser"). Off until an
-- admin turns it on in Admin -> Radio.
alter table public.token_settings add column listen_page_enabled boolean not null default false;
