-- Token pools belong to the donor's community, so Open Circle and the faith edition never see each
-- other's pools (names and purposes are the donor's own words).
alter table public.token_pools add column community_id uuid references public.communities (id);
update public.token_pools set community_id = public.member_community_id(owner_id);
alter table public.token_pools alter column community_id set not null;
create index token_pools_community_idx on public.token_pools (community_id) where closed_at is null;
