-- Admins can hide podcasts for a community (Admin → Communities), like the other features in COMMUNITY_FEATURES.
alter table public.communities drop constraint communities_hidden_features_check;
alter table public.communities add constraint communities_hidden_features_check
  check (hidden_features <@ array['radio', 'spoken', 'care', 'events', 'groups', 'awards', 'live', 'circles', 'pools', 'highlights', 'surveys', 'podcasts']);
