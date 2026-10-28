-- A new member's profile takes the language they signed up in (user metadata
-- `locale`, sent by the app), so emails and notifications start in it.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    case when new.raw_user_meta_data ->> 'locale' = 'es' then 'es' else 'en' end
  );
  insert into public.community_memberships (community_id, user_id, is_primary)
  values (public.default_community_id(), new.id, true);
  return new;
end;
$$;
