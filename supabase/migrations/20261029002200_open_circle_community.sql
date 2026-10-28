-- The non-religious edition (Steve 2026-10-28: ad-free social media "without
-- the religious angle"; internal code name "the Ted Lasso version"). It is a
-- second community on the same backend: its own feed, neutral wording in the
-- app, and no scripture or confession. Hidden until an admin turns it on
-- (Admin → Communities). "Open Circle" is a placeholder name.

insert into public.communities (slug, name, tradition, status, enabled_post_types)
values ('open-circle', 'Open Circle', 'secular', 'hidden', '{prayer_request,praise,open_prayer,testimony}')
on conflict (slug) do nothing;

-- The community a member's new content goes to: their primary membership, else the default.
create or replace function public.member_community_id(p_user uuid) returns uuid
language sql stable set search_path = '' as $$
  select coalesce(
    (select m.community_id from public.community_memberships m where m.user_id = p_user and m.is_primary),
    public.default_community_id());
$$;

-- Rows that start a thread of content (posts, conversations, events, care
-- requests) default to the default community. When the insert left that
-- default in place, put the row in its author's own community instead.
-- TG_ARGV[0] names the author column.
create or replace function public.place_in_member_community() returns trigger
language plpgsql set search_path = '' as $$
declare author uuid;
begin
  if new.community_id is null or new.community_id = public.default_community_id() then
    author := (to_jsonb(new) ->> tg_argv[0])::uuid;
    new.community_id := public.member_community_id(author);
  end if;
  return new;
end;
$$;

create trigger posts_member_community before insert on public.posts
  for each row execute function public.place_in_member_community('user_id');
create trigger conversations_member_community before insert on public.conversations
  for each row execute function public.place_in_member_community('created_by');
create trigger events_member_community before insert on public.events
  for each row execute function public.place_in_member_community('created_by');
create trigger care_requests_member_community before insert on public.care_requests
  for each row execute function public.place_in_member_community('user_id');

-- Sign-up: the app may name an active community (user metadata `community`,
-- sent by the separately branded build). Anything else joins the default.
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
  insert into public.community_memberships (community_id, user_id, is_primary)
  values (coalesce(chosen, public.default_community_id()), new.id, true);
  return new;
end;
$$;

revoke execute on function public.member_community_id(uuid) from authenticated, anon, public;
revoke execute on function public.place_in_member_community() from authenticated, anon, public;
