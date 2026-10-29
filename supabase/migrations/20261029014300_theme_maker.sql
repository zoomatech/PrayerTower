-- More skins and the theme maker (Steve, 2026-10-29: "ultimately i'd like
-- people to be able to make their own themes").
--   * 'circuit': the Neon Circuit layout (screens joined by a live wire).
--   * feed_themes.owner_id: a member's own skin. They can use it at once;
--     others see it only after an admin approves it into the community.
--   * theme_proposals.tokens: the look the member built (checked by the server).
alter type public.feed_layout add value if not exists 'circuit';

alter table public.feed_themes add column owner_id uuid references public.profiles (id) on delete cascade;
create index feed_themes_owner_id_fk_idx on public.feed_themes (owner_id);

alter table public.theme_proposals add column tokens jsonb not null default '{}';
alter table public.theme_proposals drop constraint theme_proposals_layout_check;
alter table public.theme_proposals add constraint theme_proposals_layout_check check (layout in ('vine', 'wall', 'tower', 'circuit'));
