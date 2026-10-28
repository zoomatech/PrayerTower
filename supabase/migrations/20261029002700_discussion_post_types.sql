-- Discussion, news and blog posts (Mockup 8: "Blogs / News / Discussion" in the
-- mix). Added alone (new enum values). No community has them until an admin
-- turns them on for it (Admin → Communities), so nobody sees them by default.
alter type public.post_type add value if not exists 'discussion';
alter type public.post_type add value if not exists 'news';
alter type public.post_type add value if not exists 'blog';
