-- The sign-up and password-reset emails (supabase/templates) pick Open Circle's
-- wording from the member's auth metadata (.Data.community). Keep it in step
-- with the member's community, so someone who joins Open Circle with an invite
-- code or switches to it later gets Open Circle's reset email, not Prayer Tower's.
create or replace function public.sync_auth_community() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_primary then
    update auth.users u
       set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('community', c.slug)
      from public.communities c
     where u.id = new.user_id and c.id = new.community_id
       and u.raw_user_meta_data ->> 'community' is distinct from c.slug;
  end if;
  return new;
end;
$$;

revoke execute on function public.sync_auth_community() from public, anon, authenticated;

create trigger community_memberships_sync_auth
  after insert or update of is_primary, community_id on public.community_memberships
  for each row execute function public.sync_auth_community();

-- Members who are already in a community.
update auth.users u
   set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('community', c.slug)
  from public.community_memberships m
  join public.communities c on c.id = m.community_id
 where m.user_id = u.id and m.is_primary
   and u.raw_user_meta_data ->> 'community' is distinct from c.slug;
