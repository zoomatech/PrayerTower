-- Open Circle complete. (1) An invite code can belong to a community, so the
-- people an admin invites to Open Circle land there (and get its wording)
-- without choosing it themselves; a community named at sign-up (the branded
-- build) still wins. (2) Admins can hide features for one community.

alter table public.invite_codes add column community_id uuid references public.communities (id);

create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare chosen uuid;
begin
  insert into public.profiles (id, display_name, locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    case when new.raw_user_meta_data ->> 'locale' = 'es' then 'es' else 'en' end
  );
  select c.id into chosen from public.communities c
   where c.slug = new.raw_user_meta_data ->> 'community' and c.status = 'active';
  if chosen is null then
    select c.id into chosen from public.invite_codes i join public.communities c on c.id = i.community_id
     where i.code = upper(btrim(coalesce(new.raw_user_meta_data ->> 'invite_code', ''))) and c.status = 'active';
  end if;
  insert into public.community_memberships (community_id, user_id, is_primary)
  values (coalesce(chosen, public.default_community_id()), new.id, true);
  return new;
end;
$$;

-- Features an admin hides for one community (COMMUNITY_FEATURES in packages/shared).
alter table public.communities add column hidden_features text[] not null default '{}'
  check (hidden_features <@ array['radio', 'spoken', 'care', 'events', 'groups', 'awards', 'live', 'circles', 'pools', 'highlights']);
