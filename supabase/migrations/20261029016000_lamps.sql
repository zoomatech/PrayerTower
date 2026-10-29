-- Lamp awards (research/Contributing_Without_Ad_Money.md, suggestion 1): a member
-- thanks another with a short note, like Wikipedia's barnstar. Recognition only:
-- no tokens, no price. Off by default; each giver has a weekly cap.
alter table public.notebook_settings
  add column lamps_enabled boolean not null default false,
  add column lamps_per_week smallint not null default 3 check (lamps_per_week between 1 and 20);

create table public.lamp_awards (
  id uuid primary key default public.uuid_v7(),
  giver_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  note text not null check (char_length(note) between 1 and 280),
  created_at timestamptz not null default now(),
  check (giver_id <> recipient_id)
);
create index lamp_awards_giver_id_fk_idx on public.lamp_awards (giver_id, created_at);
create index lamp_awards_recipient_id_fk_idx on public.lamp_awards (recipient_id, created_at);
alter table public.lamp_awards enable row level security;
