-- Station health page and listener acknowledgements (docs/STATION_OPERATOR_GUIDE.md,
-- "Health page" and "Listener acknowledgements"). Both off by default.
--
-- station_health_page_enabled: Admin -> Radio shows each station's last check-in,
-- the queue, recent SNR per preset and recent failures.
--
-- radio_heard_ack_enabled: a prayer counts as heard on the air only once a listener
-- decodes it (radio_prayers.heard_at). One the station sent that no listener heard
-- within radio_heard_timeout_minutes goes back in the queue, up to
-- radio_heard_max_retries times. Retries only happen while a listener node has
-- checked in recently, so a listener that is switched off doesn't cause resends.
alter table public.token_settings
  add column station_health_page_enabled boolean not null default false,
  add column radio_heard_ack_enabled boolean not null default false,
  add column radio_heard_timeout_minutes integer not null default 10 check (radio_heard_timeout_minutes between 1 and 1440),
  add column radio_heard_max_retries integer not null default 2 check (radio_heard_max_retries between 0 and 10);

alter table public.radio_prayers add column heard_retries integer not null default 0 check (heard_retries >= 0);
-- The retry sweep looks for transmitted prayers nobody heard yet.
create index radio_prayers_unheard_idx on public.radio_prayers (transmitted_at) where status = 'transmitted' and heard_at is null;
