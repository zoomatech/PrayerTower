-- The annual award winner chooses to keep the prize, donate it, or split it
-- (Project Management Document 2), while notebook_settings.prize_choice_enabled is on.
-- Donated tokens go to the infrastructure fund, which now holds regular tokens too.
alter table public.prayer_warrior_awards
  add column prize_choice text not null default 'keep' check (prize_choice in ('keep', 'donate', 'split'));

insert into public.token_accounts (kind, currency)
select 'infrastructure', 'regular'
 where not exists (select 1 from public.token_accounts where kind = 'infrastructure' and currency = 'regular');
