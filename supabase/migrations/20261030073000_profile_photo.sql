-- A member's own profile photo (Steve, 2026-10-30): it fills the oval locket on their posts.
-- The file lives in the private post-media bucket under the member's own folder; cards carry a short-lived signed URL.
alter table public.profiles add column if not exists photo_path text;
