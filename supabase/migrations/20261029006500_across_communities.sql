-- Praying across lines (concept document Phase 4: "most improbable connection
-- surfaced optionally"). While notebook_settings.cross_community_enabled is on, a
-- member who opts in sees one prayer request a day from another faith community
-- whose author also opted in. Never Open Circle or any neutral-wording community.
alter table public.notebook_settings add column cross_community_enabled boolean not null default false;
alter table public.profiles add column open_to_other_communities boolean not null default false;

create or replace function public.community_is_faith(c public.communities) returns boolean
language sql stable as $$
  select c.status = 'active'
     and coalesce(c.vocabulary ->> 'wording', case when c.tradition = 'secular' then 'neutral' else 'faith' end) = 'faith';
$$;
revoke execute on function public.community_is_faith(public.communities) from authenticated, anon, public;
