-- Feedback triage: admins tag each piece of tester feedback by type, set how
-- serious it is, add a note, and export it (Admin → Feedback). Tags match
-- FEEDBACK_TAGS in packages/shared.
alter table public.feedback
  add column tags text[] not null default '{}'
    check (tags <@ array['bug', 'crash', 'idea', 'confusing', 'content', 'notifications', 'account', 'accessibility', 'spanish', 'performance', 'praise', 'other']
           and cardinality(tags) <= 6),
  add column severity text check (severity in ('low', 'medium', 'high', 'blocker')),
  add column admin_note text check (char_length(admin_note) <= 1000),
  add column triaged_by uuid references public.profiles (id) on delete set null,
  add column triaged_at timestamptz;
create index feedback_tags on public.feedback using gin (tags);
-- Feedback sent before triage existed starts with the type the member picked.
update public.feedback set tags = array[kind] where tags = '{}';
