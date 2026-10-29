-- My prayer list (Annotated Read, chat 1: "maintain lists of people / topics to pray for
-- and sign up for automated reminders: 'did you remember to pray for grandma today?'").
-- Off by default. Private to the member: nobody else sees the list, and marking an item
-- prayed is a private note that earns no tokens and counts toward nothing.
alter table public.notebook_settings add column prayer_list_enabled boolean not null default false;

create table public.prayer_list_items (
  id uuid primary key default public.uuid_v7(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  note text not null default '' check (char_length(note) <= 280),
  remind text not null default 'off' check (remind in ('off', 'daily', 'weekly')),
  next_reminder_at timestamptz,
  last_prayed_at timestamptz,
  prayed_count int not null default 0 check (prayed_count >= 0),
  created_at timestamptz not null default now()
);
create index prayer_list_items_user_idx on public.prayer_list_items (user_id, created_at);
create index prayer_list_items_due_idx on public.prayer_list_items (next_reminder_at) where remind <> 'off';
alter table public.prayer_list_items enable row level security;
