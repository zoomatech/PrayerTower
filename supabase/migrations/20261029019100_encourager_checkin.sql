-- Encourager check-in: two weeks into a newcomer/encourager pairing, each side gets one
-- quiet "How is it going?" Answers are private. "I'd like a change" ends the pairing
-- gently and the newcomer can ask again (never matched with the same person). Off by default.
alter table public.practice_settings
  add column encourager_checkin_enabled boolean not null default false,
  add column encourager_checkin_days int not null default 14 check (encourager_checkin_days between 3 and 60);

alter table public.encourager_matches add column checkin_sent_at timestamptz;

create table public.encourager_checkins (
  match_id uuid not null references public.encourager_matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  answer text not null check (answer in ('good', 'okay', 'change')),
  created_at timestamptz not null default now(),
  primary key (match_id, user_id)
);
create index encourager_checkins_user_id_idx on public.encourager_checkins (user_id);
alter table public.encourager_checkins enable row level security;
