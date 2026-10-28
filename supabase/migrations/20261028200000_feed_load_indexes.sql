-- Load test 2026-10-28 (docs/LOAD_TEST.md): every feed card counts its post's
-- commitments, and no index started with post_id, so each count scanned by user.
create index if not exists commitments_post_idx on public.commitments (post_id) where status <> 'cancelled';
