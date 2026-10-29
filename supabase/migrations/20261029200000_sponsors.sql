-- Sponsor recognition (Business Plan 11.4, "Ways to participate"), off by default.
-- Staff list the people and groups who sponsor the launch, the Common Prayer
-- Fund, the Witness team, a token pool or a community's space, with a short
-- thank-you. The public page at /sponsors names them: no logos, no links and no
-- products, because the ad ban covers sponsors too ("sponsors fund prayer reach
-- and help, not promotion"). Rows are never deleted; staff hide one instead.
create table public.sponsor_settings (
  id boolean primary key default true check (id),
  sponsors_page_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.sponsor_settings default values;
alter table public.sponsor_settings enable row level security;

create table public.sponsors (
  id uuid primary key default public.uuid_v7(),
  name text not null check (char_length(name) between 1 and 80),
  -- launch | fund | witness | pool | community | other
  kind text not null check (kind in ('launch', 'fund', 'witness', 'pool', 'community', 'other')),
  thanks text check (char_length(thanks) <= 200),
  since date not null default current_date,
  pool_id uuid references public.token_pools (id) on delete set null,
  community_id uuid references public.communities (id) on delete set null,
  hidden_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index sponsors_pool_id_idx on public.sponsors (pool_id);
create index sponsors_community_id_idx on public.sponsors (community_id);
create index sponsors_created_by_idx on public.sponsors (created_by);
alter table public.sponsors enable row level security;
