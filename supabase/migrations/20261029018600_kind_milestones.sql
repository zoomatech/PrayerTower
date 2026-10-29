-- Private kindness milestones: quiet markers only the member sees on Me (first prayer for
-- someone, 10, 25, 50… people prayed for, encouragements sent, check-ins kept, kind words
-- left). Counts only grow; there is no leaderboard, no comparison and nothing to lose.
-- Off by default.
alter table public.practice_settings add column kind_milestones_enabled boolean not null default false;

-- Which milestones the member has already seen, so a new one can be greeted once.
create table public.kind_milestones_seen (
  user_id uuid not null references public.profiles (id) on delete cascade,
  metric text not null,
  level int not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, metric, level)
);
alter table public.kind_milestones_seen enable row level security;
