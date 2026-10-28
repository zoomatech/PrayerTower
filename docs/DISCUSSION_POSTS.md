# Discussion, news and blog posts

Mockup 8 lists "Blogs / News / Discussion" as a kind of content in the feed mix. They are three new post types: **Discussion**, **News** and **Blog Post**. All three are **off** for every community until an admin turns them on. An earlier chat worried that non-prayer posts could confuse members, so nobody sees them until an admin decides.

## Turning them on

Go to **Admin → Communities**. Each community has a row of post-type chips, and tapping a chip turns that kind of post on or off for the community. A community must keep at least one type.

## What changes once they're on

- **Compose** offers only the types the member's community has on. This also stops Open Circle members from being offered Confession.
- **Pick your mix** on Me lists only those types.
- **The post itself:**
  - It is **not prayed for**. It has no Praying Now and no promise to pray, and it can't be sent by radio, amplified, used with Power Prayer, spoken prayers or "Ask to pray".
  - The server refuses all of those with a 400.
  - People can comment, encourage and share.
  - The card shows no prayer count, and the post page hides the answered and testimony panel and the prayer list.
- **Feed and moderation:** these posts appear in the same feed and are moderated like any other post.

## Where the code is

| Part | Location |
|---|---|
| Database | `supabase/migrations/20261029002700_discussion_post_types.sql` |
| Server | `DISCUSSION_TYPES` and `requirePrayable` in `apps/server/src/modules/posts/index.ts`, and `enabledPostTypes` on `PATCH /admin/communities/:slug` |
| Shared | `DISCUSSION_TYPES` and `isPrayable` in `packages/shared/src/index.ts` |
| Tests | `apps/server/test/discussion-posts.test.ts` |
